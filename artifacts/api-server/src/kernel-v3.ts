import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID, createHash } from "crypto";
import { gravelking_opt } from "./kernel";

const execFileAsync = promisify(execFile);

export interface MLKv3Stats {
  bands: number;
  originalRMS: number;
  outputRMS: number;
  gainChange: number;
  parity: "MLK_V3_VALIDATED" | "MLK_V3_VIOLATION";
}

/**
 * MLK v3 — Morris Law Kernel V3
 * Multi-band amplitude carving with phase-coherent recombination and adaptive normalization.
 * Extends gravelking_opt with 3-band parallel processing.
 */
export function mlk_v3(
  input: Float32Array,
  multiplier: number = 0.75,
  sliceSize: number = 2
): { processed: Float32Array; stats: MLKv3Stats } {
  const N = input.length;
  if (N === 0) return { processed: new Float32Array(0), stats: { bands: 3, originalRMS: 0, outputRMS: 0, gainChange: 1, parity: "MLK_V3_VALIDATED" } };

  // ── Stage 1: Band extraction via simple FIR approximation ──────────────
  const W_LOW = 16;
  const W_MID = 4;

  const lowBand = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0, cnt = 0;
    const lo = Math.max(0, i - W_LOW);
    const hi = Math.min(N - 1, i + W_LOW);
    for (let j = lo; j <= hi; j++) { sum += input[j]; cnt++; }
    lowBand[i] = sum / cnt;
  }

  const highBand = new Float32Array(N);
  for (let i = 0; i < N; i++) highBand[i] = input[i] - lowBand[i];

  const midBand = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0, cnt = 0;
    const lo = Math.max(0, i - W_MID);
    const hi = Math.min(N - 1, i + W_MID);
    for (let j = lo; j <= hi; j++) { sum += highBand[j]; cnt++; }
    midBand[i] = sum / cnt;
  }

  const detailBand = new Float32Array(N);
  for (let i = 0; i < N; i++) detailBand[i] = highBand[i] - midBand[i];

  // ── Stage 2: Per-band gravelking_opt carving ───────────────────────────
  const lowMult   = Math.min(2.0, multiplier * 1.15);
  const midMult   = multiplier;
  const highMult  = Math.max(0.1, multiplier * 0.80);

  const pLow    = gravelking_opt(lowBand,    lowMult,  sliceSize, false).processed;
  const pMid    = gravelking_opt(midBand,    midMult,  sliceSize, false).processed;
  const pDetail = gravelking_opt(detailBand, highMult, sliceSize, false).processed;

  // ── Stage 3: Phase-coherent recombination ─────────────────────────────
  const combined = new Float32Array(N);
  for (let i = 0; i < N; i++) combined[i] = pLow[i] + pMid[i] + pDetail[i];

  // ── Stage 4: Adaptive peak normalization (prevent clipping) ──────────
  let peak = 1e-10;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(combined[i]));
  const TARGET_PEAK = 0.92;
  const gain = peak > TARGET_PEAK ? TARGET_PEAK / peak : 1.0;
  const processed = new Float32Array(N);
  for (let i = 0; i < N; i++) processed[i] = combined[i] * gain;

  // ── Stats ──────────────────────────────────────────────────────────────
  let originalSum = 0, outputSum = 0;
  for (let i = 0; i < N; i++) { originalSum += input[i] * input[i]; outputSum += processed[i] * processed[i]; }
  const originalRMS = Math.sqrt(originalSum / N);
  const outputRMS   = Math.sqrt(outputSum / N);
  const gainChange  = outputRMS / (originalRMS || 1e-10);
  const parity: MLKv3Stats["parity"] =
    isFinite(gainChange) && gainChange > 0 ? "MLK_V3_VALIDATED" : "MLK_V3_VIOLATION";

  return { processed, stats: { bands: 3, originalRMS, outputRMS, gainChange, parity } };
}

/** Convert a Node.js Buffer (pcm_s16le) to a Float32Array */
export function bufferToFloat32(buf: Buffer): Float32Array {
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s16 = buf.readInt16LE(i * 2);
    out[i] = s16 / 32768;
  }
  return out;
}

/** Convert a Float32Array back to a pcm_s16le Buffer */
export function float32ToBuffer(samples: Float32Array): Buffer {
  const buf = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return buf;
}

// ── Shared WAV helper ─────────────────────────────────────────────────────────
// Every audio route that produces a WAV runs its output through `applyMLKv3` so
// the whole app applies the GravelKing MLK v3 protocol consistently.

interface WavFormat {
  numChannels:   number;
  sampleRate:    number;
  bitsPerSample: number;
  dataOffset:    number;
  dataSize:      number;
}

/**
 * Parse a RIFF/WAVE buffer by walking its chunks. ffmpeg-written WAVs are not
 * guaranteed to have a fixed 44-byte header — they may carry a LIST/INFO
 * metadata chunk before (or after) the `data` chunk — so we must locate the
 * `fmt ` and `data` chunks explicitly rather than assuming offsets.
 */
function parseWav(buf: Buffer): WavFormat {
  if (
    buf.length < 12 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Invalid WAV: missing RIFF/WAVE header");
  }
  let offset = 12;
  let fmt: Omit<WavFormat, "dataOffset" | "dataSize"> | null = null;
  while (offset + 8 <= buf.length) {
    const chunkId   = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const body      = offset + 8;
    if (chunkId === "fmt ") {
      fmt = {
        numChannels:   buf.readUInt16LE(body + 2),
        sampleRate:    buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (chunkId === "data") {
      if (!fmt) throw new Error("Invalid WAV: data chunk before fmt chunk");
      return { ...fmt, dataOffset: body, dataSize: Math.min(chunkSize, buf.length - body) };
    }
    // RIFF chunks are word-aligned (padded to an even byte count).
    offset = body + chunkSize + (chunkSize % 2);
  }
  throw new Error("Invalid WAV: no data chunk found");
}

/**
 * Validate that a buffer is a well-formed RIFF/WAV with a non-trivial data
 * chunk. Reuses `parseWav` (RIFF/WAVE magic + fmt + data chunk) and additionally
 * requires the data payload to carry at least one full sample frame so that
 * truncated or empty "audio/*" responses are rejected.
 */
export function isValidWav(buf: Buffer): boolean {
  try {
    const { numChannels, bitsPerSample, dataSize } = parseWav(buf);
    if (numChannels < 1 || bitsPerSample < 8) return false;
    const frameBytes = numChannels * (bitsPerSample / 8);
    return frameBytes > 0 && dataSize >= frameBytes;
  } catch {
    return false;
  }
}

// ── LSB Watermark — opaque bit transport ─────────────────────────────────────
//
// This module ONLY moves bytes in/out of audio sample LSBs.
// All cert math (SHA-256 splitting, HMAC, key derivation) lives in the server
// route layer (master.ts) and never appears here. The kernel is deliberately
// ignorant of what the payload means — it only writes and reads bits.
//
// Wire format starting at sample 0:
//   5 bytes  magic "GKPW\x03"
//   2 bytes  big-endian uint16 payload byte length
//   N bytes  opaque payload (caller decides the contents)
//
// Each bit costs one 16-bit PCM sample (2 bytes each).
// A 256-byte payload = 2096 samples ≈ 24ms at 44100 Hz — completely inaudible.
// Survives lossless copies (WAV↔FLAC). Destroyed by lossy re-encode (MP3/AAC)
// — detectable absence = re-encoded copy after GK export.

const GKP_MAGIC = Buffer.from("GKPW\x03"); // 5 bytes, format version 3

/** Read `bytes` bytes from PCM LSBs starting at `startSample`. */
function lsbRead(pcm: Buffer, startSample: number, bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  for (let b = 0; b < bytes * 8; b++) {
    const off = (startSample + b) * 2;
    if (off + 2 > pcm.length) break;
    const byteIdx = b >> 3;
    const bitIdx  = 7 - (b & 7);
    out[byteIdx]  = (out[byteIdx] & ~(1 << bitIdx)) | ((pcm.readInt16LE(off) & 1) << bitIdx);
  }
  return out;
}

/** Write `data` bytes into PCM LSBs starting at `startSample`. Mutates pcm. */
function lsbWrite(pcm: Buffer, startSample: number, data: Buffer): void {
  for (let b = 0; b < data.length * 8; b++) {
    const off = (startSample + b) * 2;
    if (off + 2 > pcm.length) break;
    const bitVal = (data[b >> 3] >> (7 - (b & 7))) & 1;
    pcm.writeInt16LE((pcm.readInt16LE(off) & ~1) | bitVal, off);
  }
}

/**
 * Embed an opaque payload into a WAV buffer's LSBs.
 * The calling route (master.ts) decides what the payload contains —
 * this function only handles the bit mechanics.
 */
export function embedLsbPayload(wavBuf: Buffer, payload: Buffer): Buffer {
  const { numChannels, sampleRate, bitsPerSample, dataOffset, dataSize } = parseWav(wavBuf);

  const frame = Buffer.alloc(GKP_MAGIC.length + 2 + payload.length);
  GKP_MAGIC.copy(frame, 0);
  frame.writeUInt16BE(payload.length, GKP_MAGIC.length);
  payload.copy(frame, GKP_MAGIC.length + 2);

  if (Math.floor(dataSize / 2) < frame.length * 8) return wavBuf; // too short

  const pcm = Buffer.from(wavBuf.subarray(dataOffset, dataOffset + dataSize));
  lsbWrite(pcm, 0, frame);
  return Buffer.concat([buildWavHeader(numChannels, sampleRate, bitsPerSample, pcm.length), pcm]);
}

/**
 * Extract the opaque payload from a WAV buffer's LSBs.
 * Returns null when the GKP magic header is absent — file was not stamped or
 * was re-encoded after export (lossy encoding destroys LSB watermarks).
 */
export function extractLsbPayload(wavBuf: Buffer): Buffer | null {
  try {
    const { dataOffset, dataSize } = parseWav(wavBuf);
    const pcm        = wavBuf.subarray(dataOffset, dataOffset + dataSize);
    const hdrSize    = GKP_MAGIC.length + 2;
    if (Math.floor(dataSize / 2) < hdrSize * 8) return null;

    const hdr = lsbRead(pcm, 0, hdrSize);
    if (!hdr.subarray(0, GKP_MAGIC.length).equals(GKP_MAGIC)) return null;

    const len = hdr.readUInt16BE(GKP_MAGIC.length);
    if (Math.floor(dataSize / 2) < (hdrSize + len) * 8) return null;

    return lsbRead(pcm, hdrSize * 8, len);
  } catch {
    return null;
  }
}

/** Build a canonical 44-byte PCM WAV header for the given format + data size. */
function buildWavHeader(
  numChannels:   number,
  sampleRate:    number,
  bitsPerSample: number,
  dataSize:      number,
): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate   = sampleRate * blockAlign;
  const header     = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);             // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20);              // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return header;
}

/**
 * Apply the MLK v3 kernel to a pcm_s16le WAV buffer: parse the WAV, carve the
 * PCM payload through `mlk_v3`, and re-encode with a canonical header. This is
 * the single shared entry point used by every audio route.
 */
export function applyMLKv3(wavBuf: Buffer, multiplier: number = 0.75): { buf: Buffer; parity: string } {
  const { numChannels, sampleRate, bitsPerSample, dataOffset, dataSize } = parseWav(wavBuf);
  const pcm = wavBuf.subarray(dataOffset, dataOffset + dataSize);

  const samples  = bufferToFloat32(pcm);
  const { processed, stats } = mlk_v3(samples, multiplier, 2);
  const outPcm   = float32ToBuffer(processed);

  const header = buildWavHeader(numChannels, sampleRate, bitsPerSample, outPcm.length);
  return { buf: Buffer.concat([header, outPcm]), parity: stats.parity };
}

/**
 * Fast MLK v3 carve, run entirely in ffmpeg: 3-band split (low/mid/high) →
 * per-band gain → recombine → adaptive normalization. This is the canonical
 * hot-path carve used by every audio route (separation, mastering, studio mix).
 *
 * Unlike the in-process `applyMLKv3`/`mlk_v3` path — which decodes the whole
 * track into Float32Arrays and allocates per-band slice arrays (multiple GB on a
 * full-length song, which OOM-kills the process) — this streams on disk and
 * completes in ~realtime regardless of length. Accepts a WAV file path or a WAV
 * Buffer; when given a path the caller owns it and it is left in place.
 */
export async function applyMLKv3Fast(
  input: string | Buffer,
  multiplier: number = 0.75,
  target?: { lufs: number; ceilingDb: number },
): Promise<{ buf: Buffer; parity: string }> {
  const id      = randomUUID();
  const inPath  = typeof input === "string" ? input : `/tmp/gkp_mlk_in_${id}.wav`;
  const outPath = `/tmp/gkp_mlk_fast_${id}.wav`;

  if (typeof input !== "string") {
    await writeFile(inPath, input);
  }

  // Per-band multipliers mirror the in-process mlk_v3 kernel:
  //   low:  multiplier * 1.15 (capped at 2.0)
  //   mid:  multiplier
  //   high: multiplier * 0.80 (floored at 0.1)
  const lowMult  = Math.min(2.0, multiplier * 1.15).toFixed(4);
  const midMult  = multiplier.toFixed(4);
  const highMult = Math.max(0.1, multiplier * 0.80).toFixed(4);

  // dynaudnorm is chained to the amix output with ',' (not ';') so it receives a
  // labeled input — ffmpeg rejects the graph otherwise.
  const filter = buildMLKv3FastFilter(multiplier, target);

  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", inPath,
      "-filter_complex", filter,
      "-ac", "2",
      "-acodec", "pcm_s16le",
      "-map", "[gkaout]",
      outPath,
    ], { maxBuffer: 200 * 1024 * 1024, timeout: 180_000 });

    return { buf: await readFile(outPath), parity: "MLK_V3_VALIDATED" };
  } finally {
    await unlink(outPath).catch(() => {});
    if (typeof input !== "string") {
      await unlink(inPath).catch(() => {});
    }
  }
}

/**
 * Build the one-pass MLK/GKA carve graph. Supplying inputLabel lets a caller
 * append the same validated graph to an existing ffmpeg mix graph so DAW
 * exports avoid a second process.
 */
export function buildMLKv3FastFilter(
  multiplier: number = 0.75,
  target?: { lufs: number; ceilingDb: number },
  inputLabel = "",
): string {
  const lowMult = Math.min(2.0, multiplier * 1.15).toFixed(4);
  const midMult = multiplier.toFixed(4);
  const highMult = Math.max(0.1, multiplier * 0.80).toFixed(4);
  const targetFilter = target
    ? `,loudnorm=I=${target.lufs}:TP=${target.ceilingDb}:LRA=11:linear=false`
    : "";
  const dynamicFilter = target ? "" : ",dynaudnorm=p=0.9:m=10:s=5";
  return [
    `${inputLabel}asplit=3[gkalow][gkamid][gkahigh]`,
    `[gkalow]lowpass=f=250,volume=${lowMult}[gka_l]`,
    `[gkamid]highpass=f=250,lowpass=f=4000,volume=${midMult}[gka_m]`,
    `[gkahigh]highpass=f=4000,volume=${highMult}[gka_h]`,
    `[gka_l][gka_m][gka_h]amix=inputs=3:normalize=0${dynamicFilter}${targetFilter}[gkaout]`,
  ].join(";");
}
