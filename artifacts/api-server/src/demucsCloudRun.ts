/**
 * GravelKing Productions — Demucs Cloud Run Client
 * Calls the user's Google Cloud Run demucs container for true neural separation.
 * Falls back to DSP in audio.ts if DEMUCS_URL is not set or the call fails.
 *
 * Auth: x-api-key header using REMOTE_KERNEL_API_KEY secret.
 * Set DEMUCS_URL env var to the Cloud Run service URL after deploying.
 *
 * Pre-converts every input to stereo 44.1 kHz WAV before sending — torchaudio
 * on Cloud Run crashes on some MP3/M4A encodings; WAV is always safe.
 * Files > 20 MB after conversion are routed directly to DSP fallback (Cloud Run
 * has a 32 MB body limit and larger files hang rather than returning 413 cleanly).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink, stat } from "fs/promises";
import { randomUUID } from "crypto";
import { zipSync } from "fflate";
import { applyMLKv3Fast } from "./kernel-v3";
import type { GNSResult, GNSVocalResult } from "./gkp-separator";

const execFileAsync = promisify(execFile);

/** Maximum file size sent to Cloud Run (bytes). Above this we skip straight to DSP. */
const CLOUD_RUN_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export function isDemucsConfigured(): boolean {
  return !!process.env["DEMUCS_URL"];
}

function getDemucsBase(): string {
  const url = process.env["DEMUCS_URL"];
  if (!url) throw new Error("DEMUCS_URL not configured");
  return url.replace(/\/$/, "");
}

function demucsHeaders(): Record<string, string> {
  const key = process.env["REMOTE_KERNEL_API_KEY"] ?? process.env["DEMUCS_API_KEY"];
  return key ? { "x-api-key": key } : {};
}

interface StemResponse {
  stems: Record<string, string>;
  model: string;
}

/**
 * Convert any audio file to stereo 44.1 kHz WAV — the format torchaudio
 * on Cloud Run decodes most reliably. Returns the temp WAV path and a
 * cleanup function. Caller must always call cleanup().
 */
async function toWav(inputPath: string): Promise<{ wavPath: string; cleanup: () => Promise<void> }> {
  const id      = randomUUID();
  const wavPath = `/tmp/gkp_cr_${id}.wav`;
  await execFileAsync("ffmpeg", [
    "-y", "-i", inputPath,
    "-ac", "2",       // stereo
    "-ar", "44100",   // 44.1 kHz — safe default for torchaudio
    "-f", "wav", wavPath,
  ], { timeout: 120_000 });
  return {
    wavPath,
    cleanup: () => unlink(wavPath).catch(() => {}),
  };
}

/**
 * POST audio to the Cloud Run /separate endpoint (mode=voice_remove).
 * Returns: { vocals, no_vocals } — we return the no_vocals (instrumental) Buffer
 * post-processed through MLK v3.
 */
export async function demucsVoiceRemove(
  filePath:   string,
  multiplier: number = 0.75,
): Promise<GNSVocalResult> {
  const { wavPath, cleanup } = await toWav(filePath);
  try {
    // Skip Cloud Run for large files — avoid 413 / hanging requests.
    const { size } = await stat(wavPath);
    if (size > CLOUD_RUN_MAX_BYTES) {
      throw new Error(`voice_remove: WAV too large for Cloud Run (${Math.round(size / 1e6)} MB > 20 MB limit); using DSP`);
    }

    const audioBytes = await readFile(wavPath);
    const form = new FormData();
    form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "input.wav");
    form.append("mode", "voice_remove");

    const res = await fetch(`${getDemucsBase()}/separate`, {
      method:  "POST",
      headers: demucsHeaders(),
      body:    form,
      signal:  AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Demucs Cloud Run voice_remove ${res.status}: ${msg.slice(0, 200)}`);
    }

    const json = await res.json() as StemResponse;
    const b64  = json.stems?.["no_vocals"] ?? json.stems?.["instrumental"];
    if (!b64) throw new Error("Demucs Cloud Run returned no instrumental stem");

    const rawBuf          = Buffer.from(b64, "base64");
    const { buf, parity } = await applyMLKv3Fast(rawBuf, multiplier);

    return {
      instrumental: buf,
      kernelParity: parity,
      protocol:     "GravelKing_CloudRun_Demucs",
      model:        json.model ?? "htdemucs",
      stack:        "GravelKing_CloudRun_Demucs+MLK_v3",
    };
  } finally {
    await cleanup();
  }
}

/**
 * POST audio to the Cloud Run /separate endpoint (mode=stem_split).
 * Returns all stems (drums, bass, other, vocals, instrumental) as a ZIP
 * post-processed through MLK v3.
 */
export async function demucsStemSplit(
  filePath:   string,
  multiplier: number = 0.75,
): Promise<GNSResult> {
  const { wavPath, cleanup } = await toWav(filePath);
  try {
    // Skip Cloud Run for large files — avoid 413 / hanging requests.
    const { size } = await stat(wavPath);
    if (size > CLOUD_RUN_MAX_BYTES) {
      throw new Error(`stem_split: WAV too large for Cloud Run (${Math.round(size / 1e6)} MB > 20 MB limit); using DSP`);
    }

    const audioBytes = await readFile(wavPath);
    const form = new FormData();
    form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "input.wav");
    form.append("mode", "stem_split");

    const res = await fetch(`${getDemucsBase()}/separate`, {
      method:  "POST",
      headers: demucsHeaders(),
      body:    form,
      signal:  AbortSignal.timeout(600_000),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Demucs Cloud Run stem_split ${res.status}: ${msg.slice(0, 200)}`);
    }

    const json = await res.json() as StemResponse;
    if (!json.stems || Object.keys(json.stems).length === 0) {
      throw new Error("Demucs Cloud Run returned no stems");
    }

    const zipInput: Record<string, Uint8Array> = {};
    const stemNames: string[] = [];
    let   kernelParity        = "MLK_V3_VALIDATED";

    for (const [name, b64] of Object.entries(json.stems)) {
      const rawBuf          = Buffer.from(b64, "base64");
      const { buf, parity } = await applyMLKv3Fast(rawBuf, multiplier);
      if (parity !== "MLK_V3_VALIDATED") kernelParity = parity;
      zipInput[`GKP_${name}.wav`] = new Uint8Array(buf);
      stemNames.push(name);
    }

    return {
      zipBuffer:    Buffer.from(zipSync(zipInput)),
      protocol:     "GravelKing_CloudRun_Demucs",
      model:        json.model ?? "htdemucs",
      stems:        stemNames,
      kernelParity,
      stack:        "GravelKing_CloudRun_Demucs+MLK_v3",
    };
  } finally {
    await cleanup();
  }
}
