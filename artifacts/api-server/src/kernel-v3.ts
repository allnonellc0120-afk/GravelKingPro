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
