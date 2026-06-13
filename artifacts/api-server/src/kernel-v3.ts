import { gravelking_opt } from "./kernel";

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
  input: number[],
  multiplier: number = 0.75,
  sliceSize: number = 2
): { processed: number[]; stats: MLKv3Stats } {
  const N = input.length;
  if (N === 0) return { processed: [], stats: { bands: 3, originalRMS: 0, outputRMS: 0, gainChange: 1, parity: "MLK_V3_VALIDATED" } };

  // ── Stage 1: Band extraction via simple FIR approximation ──────────────
  const W_LOW = 16;   // low-band smoothing window
  const W_MID = 4;    // mid-band smoothing window

  const lowBand: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - W_LOW); j <= Math.min(N - 1, i + W_LOW); j++) {
      sum += input[j]; cnt++;
    }
    lowBand[i] = sum / cnt;
  }

  const highBand = input.map((s, i) => s - lowBand[i]);

  const midBand: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - W_MID); j <= Math.min(N - 1, i + W_MID); j++) {
      sum += highBand[j]; cnt++;
    }
    midBand[i] = sum / cnt;
  }

  const detailBand = highBand.map((s, i) => s - midBand[i]);

  // ── Stage 2: Per-band gravelking_opt carving ───────────────────────────
  const lowMult   = Math.min(2.0, multiplier * 1.15);  // boost bass slightly
  const midMult   = multiplier;
  const highMult  = Math.max(0.1, multiplier * 0.80);  // gentle on highs

  const pLow    = gravelking_opt(lowBand,    lowMult,  sliceSize).processed;
  const pMid    = gravelking_opt(midBand,    midMult,  sliceSize).processed;
  const pDetail = gravelking_opt(detailBand, highMult, sliceSize).processed;

  // ── Stage 3: Phase-coherent recombination ─────────────────────────────
  const combined = pLow.map((s, i) => s + (pMid[i] ?? 0) + (pDetail[i] ?? 0));

  // ── Stage 4: Adaptive peak normalization (prevent clipping) ──────────
  const peak = combined.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-10);
  const TARGET_PEAK = 0.92;
  const gain = peak > TARGET_PEAK ? TARGET_PEAK / peak : 1.0;
  const processed = combined.map(s => s * gain);

  // ── Stats ──────────────────────────────────────────────────────────────
  const rmsOf = (arr: number[]) =>
    Math.sqrt(arr.reduce((s, x) => s + x * x, 0) / (arr.length || 1));

  const originalRMS = rmsOf(input);
  const outputRMS   = rmsOf(processed);
  const gainChange  = outputRMS / (originalRMS || 1e-10);
  const parity: MLKv3Stats["parity"] =
    isFinite(gainChange) && gainChange > 0 ? "MLK_V3_VALIDATED" : "MLK_V3_VIOLATION";

  return { processed, stats: { bands: 3, originalRMS, outputRMS, gainChange, parity } };
}

/** Convert a Node.js Buffer (pcm_s16le) to a float32 sample array */
export function bufferToFloat32(buf: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const s16 = buf.readInt16LE(i);
    out.push(s16 / 32768);
  }
  return out;
}

/** Convert a float32 sample array back to a pcm_s16le Buffer */
export function float32ToBuffer(samples: number[]): Buffer {
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
