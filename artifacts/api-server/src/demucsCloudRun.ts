/**
 * GravelKing Productions — Demucs Cloud Run Client
 * Calls the user's Google Cloud Run demucs container for true neural separation.
 * Falls back to DSP in audio.ts if DEMUCS_URL is not set or the call fails.
 *
 * Auth: x-api-key header using REMOTE_KERNEL_API_KEY secret.
 * Set DEMUCS_URL env var to the Cloud Run service URL after deploying.
 */

import { readFile } from "fs/promises";
import { zipSync } from "fflate";
import { applyMLKv3Fast } from "./kernel-v3";
import type { GNSResult, GNSVocalResult } from "./gkp-separator";

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
 * POST audio to the Cloud Run /separate endpoint (mode=voice_remove).
 * Returns: { vocals, no_vocals } — we return the no_vocals (instrumental) Buffer
 * post-processed through MLK v3.
 */
export async function demucsVoiceRemove(
  filePath:   string,
  multiplier: number = 0.75,
): Promise<GNSVocalResult> {
  const audioBytes = await readFile(filePath);
  const ext        = filePath.split(".").pop() ?? "wav";

  const form = new FormData();
  form.append("audio", new Blob([audioBytes], { type: `audio/${ext}` }), `input.${ext}`);
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
  const audioBytes = await readFile(filePath);
  const ext        = filePath.split(".").pop() ?? "wav";

  const form = new FormData();
  form.append("audio", new Blob([audioBytes], { type: `audio/${ext}` }), `input.${ext}`);
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
}
