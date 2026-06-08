/**
 * GravelKing Neural Separator (GNS) v1
 * GravelKing Protocol — All N One LLC
 *
 * Pipeline: GNS Neural Separation (Demucs htdemucs) → MLK v3 Kernel Post-Processing
 * Neural stem separation under the GravelKing Protocol stack.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, unlink, rm, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { join, basename, extname, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { zipSync } from "fflate";
import { mlk_v3, bufferToFloat32, float32ToBuffer } from "./kernel-v3";

const execFileAsync = promisify(execFile);

// Wrapper script that patches torchaudio.load/save to use ffmpeg (bypasses missing torchcodec).
// Resolves relative to the compiled bundle: dist/ -> .. -> artifacts/api-server/
const _here = dirname(fileURLToPath(import.meta.url));
const DEMUCS_RUNNER = resolve(_here, "..", "gkp_demucs_runner.py");

export const GNS_PROTOCOL  = "GravelKing_Neural_Separator_v1";
export const GNS_MODEL     = "htdemucs";
export const GNS_KERNEL    = "MLK_v3";
export const GNS_STACK     = `${GNS_PROTOCOL}+${GNS_KERNEL}`;

const DEMUCS_TIMEOUT = 360_000; // 6 min max for long tracks

/** Convert any WAV (e.g. float32 from demucs) to pcm_s16le WAV via ffmpeg. */
async function normalizeToS16le(inputBuf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath  = `/tmp/gkp_norm_in_${id}.wav`;
  const outPath = `/tmp/gkp_norm_out_${id}.wav`;
  await writeFile(inPath, inputBuf);
  await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-acodec", "pcm_s16le", outPath], { timeout: 120_000 });
  const result = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return result;
}

/**
 * Apply MLK v3 kernel to a pcm_s16le WAV buffer.
 * Preserves the WAV header, processes only the PCM payload.
 */
function applyMLKv3(wavBuf: Buffer, multiplier: number): { buf: Buffer; parity: string } {
  const header = Buffer.from(wavBuf.subarray(0, 44));
  const pcm    = wavBuf.subarray(44);

  const samples  = bufferToFloat32(pcm);
  const { processed, stats } = mlk_v3(samples, multiplier, 2);
  const outPcm   = float32ToBuffer(processed);

  const result = Buffer.concat([header, outPcm]);
  // Patch WAV size fields so players don't choke on mismatched lengths
  result.writeUInt32LE(result.length - 8, 4);   // RIFF chunk size
  result.writeUInt32LE(outPcm.length,     40);   // data chunk size
  return { buf: result, parity: stats.parity };
}

// ── GNS 4-stem split ─────────────────────────────────────────────────────────

export interface GNSResult {
  zipBuffer:    Buffer;
  protocol:     string;
  model:        string;
  stems:        string[];
  kernelParity: string;
  stack:        string;
}

/**
 * GNS Stem Split — 4-stem separation (vocals / drums / bass / other).
 * Each stem is processed through MLK v3 post-separation.
 */
export async function gnsStemSplit(
  inputBuf:   Buffer,
  ext:        string,
  multiplier: number = 0.75
): Promise<GNSResult> {
  const id        = randomUUID();
  const inputPath = `/tmp/gns_in_${id}.${ext}`;
  const outputDir = `/tmp/gns_out_${id}`;

  await writeFile(inputPath, inputBuf);
  await mkdir(outputDir, { recursive: true });

  try {
    // ── Stage 1: GNS Neural Separation ──────────────────────────────────────
    await execFileAsync("python3", [
      DEMUCS_RUNNER,
      "-n",     GNS_MODEL,
      "--out",  outputDir,
      "--jobs", "1",
      inputPath,
    ], { maxBuffer: 200 * 1024 * 1024, timeout: DEMUCS_TIMEOUT });

    const trackName = basename(inputPath, extname(inputPath));
    const stemDir   = join(outputDir, GNS_MODEL, trackName);
    const stemFiles = (await readdir(stemDir)).filter(f => f.endsWith(".wav"));

    // ── Stage 2: MLK v3 Kernel Post-Processing on each stem ─────────────────
    const zipInput: Record<string, Uint8Array> = {};
    let kernelParity = "MLK_V3_VALIDATED";
    const stemNames: string[] = [];

    for (const file of stemFiles) {
      const rawBuf  = await readFile(join(stemDir, file));
      const s16Buf  = await normalizeToS16le(rawBuf);
      const { buf, parity } = applyMLKv3(s16Buf, multiplier);
      if (parity !== "MLK_V3_VALIDATED") kernelParity = parity;
      const label = file.replace(".wav", "");
      zipInput[`GKP_${label}.wav`] = new Uint8Array(buf);
      stemNames.push(label);
    }

    return {
      zipBuffer: Buffer.from(zipSync(zipInput)),
      protocol:  GNS_PROTOCOL,
      model:     GNS_MODEL,
      stems:     stemNames,
      kernelParity,
      stack:     GNS_STACK,
    };
  } finally {
    await unlink(inputPath).catch(() => {});
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── GNS Voice Removal ────────────────────────────────────────────────────────

export interface GNSVocalResult {
  instrumental: Buffer;
  kernelParity: string;
  protocol:     string;
  model:        string;
  stack:        string;
}

/**
 * GNS Voice Removal — two-stems mode (vocals / no_vocals).
 * Returns the ML-isolated instrumental after MLK v3 post-processing.
 * Works on both mono and stereo input.
 */
export async function gnsVocalRemoval(
  inputBuf:   Buffer,
  ext:        string,
  multiplier: number = 0.75
): Promise<GNSVocalResult> {
  const id        = randomUUID();
  const inputPath = `/tmp/gns_vr_in_${id}.${ext}`;
  const outputDir = `/tmp/gns_vr_out_${id}`;

  await writeFile(inputPath, inputBuf);
  await mkdir(outputDir, { recursive: true });

  try {
    // ── Stage 1: GNS Two-Stem Separation ────────────────────────────────────
    await execFileAsync("python3", [
      DEMUCS_RUNNER,
      "-n",           GNS_MODEL,
      "--two-stems",  "vocals",
      "--out",        outputDir,
      "--jobs",       "1",
      inputPath,
    ], { maxBuffer: 200 * 1024 * 1024, timeout: DEMUCS_TIMEOUT });

    const trackName  = basename(inputPath, extname(inputPath));
    const stemDir    = join(outputDir, GNS_MODEL, trackName);
    const noVocalBuf = await readFile(join(stemDir, "no_vocals.wav"));

    // ── Stage 2: MLK v3 Post-Processing ─────────────────────────────────────
    const s16Buf              = await normalizeToS16le(noVocalBuf);
    const { buf, parity }     = applyMLKv3(s16Buf, multiplier);

    return {
      instrumental: buf,
      kernelParity: parity,
      protocol:     GNS_PROTOCOL,
      model:        GNS_MODEL,
      stack:        GNS_STACK,
    };
  } finally {
    await unlink(inputPath).catch(() => {});
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}
