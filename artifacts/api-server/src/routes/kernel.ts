import { Router } from "express";
import { gravelking_opt, verifyParity, generateSeedData } from "../kernel";
import { mlk_v3 } from "../kernel-v3";

const kernelRouter = Router();

// Sample rate assumed for the synthetic demo clip when reporting a real-time ratio.
const SAMPLE_RATE = 44100;
// Bound the public before/after demo so an arbitrary caller can't push a huge array.
const MAX_SAMPLES = 48000; // ~1.1s @ 44.1k

/**
 * Deterministic, audio-like sample clip used for the public MLK v3 before/after
 * demo when the visitor hasn't supplied their own input. Two percussive grains
 * (sharp attack + exponential decay) over a harmonic tone give it a high crest
 * factor, so MLK v3's multi-band carving + adaptive normalization produce a
 * visible, reproducible difference against the raw baseline.
 */
function generateSampleClip(n = 8192): Float32Array {
  const out = new Float32Array(n);
  const w = (110 / SAMPLE_RATE) * 2 * Math.PI; // ~110 Hz fundamental
  const grain = n / 2;
  for (let i = 0; i < n; i++) {
    const phase = (i % grain) / grain; // 0..1 within each grain
    const env = Math.exp(-6 * phase);
    const tone =
      Math.sin(w * i) +
      0.5 * Math.sin(2 * w * i) +
      0.25 * Math.sin(3 * w * i);
    out[i] = env * tone;
  }
  let pk = 1e-9;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
  const g = 0.95 / pk; // normalize raw baseline to ~0.95 peak
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

function rms(a: Float32Array): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
}

function peak(a: Float32Array): number {
  let p = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]);
    if (v > p) p = v;
  }
  return p;
}

kernelRouter.post("/kernel/process", (req, res) => {
  try {
    const body = req.body ?? {};

    // ── MLK v3 ON/OFF before/after comparison ────────────────────────────
    if (typeof body.mlk === "boolean") {
      const { mlk, input_data, multiplier } = body;

      let input: Float32Array;
      if (Array.isArray(input_data) && input_data.length > 0) {
        if (input_data.length > MAX_SAMPLES) {
          return res.status(400).json({
            success: false,
            error: `Input too large: max ${MAX_SAMPLES} samples.`,
          });
        }
        input = new Float32Array(input_data.length);
        for (let i = 0; i < input_data.length; i++) {
          const v = input_data[i];
          if (typeof v !== "number" || !Number.isFinite(v)) {
            return res.status(400).json({
              success: false,
              error: `Invalid sample at index ${i}: must be a finite number.`,
            });
          }
          input[i] = v;
        }
      } else {
        input = generateSampleClip();
      }

      const mult =
        typeof multiplier === "number" && Number.isFinite(multiplier)
          ? Math.max(0.1, Math.min(2.0, multiplier))
          : 1.0;

      const t0 = performance.now();
      let output: Float32Array;
      let parity: string;
      if (mlk) {
        const r = mlk_v3(input, mult, 2);
        output = r.processed;
        parity = r.stats.parity;
      } else {
        output = input; // raw baseline — NO kernel applied
        parity = "BASELINE";
      }
      const timeMs = performance.now() - t0;

      const inRms = rms(input);
      const outRms = rms(output);
      const outPeak = peak(output);
      const gainChangeDb = inRms > 0 && outRms > 0 ? 20 * Math.log10(outRms / inRms) : 0;
      const CEILING = 0.92;
      const efficiency =
        outPeak <= 0 ? 0 : outPeak <= CEILING ? outPeak / CEILING : CEILING / outPeak;
      const audioSeconds = input.length / SAMPLE_RATE;
      const realtimeRatio = timeMs > 0.01 ? audioSeconds / (timeMs / 1000) : null;

      return res.status(200).json({
        success: true,
        mode: mlk ? "mlk_v3" : "raw",
        mlk,
        timing: { timeMs, sampleCount: input.length, realtimeRatio },
        metrics: { rms: outRms, peak: outPeak, gainChangeDb, efficiency, parity },
      });
    }

    // ── Legacy parity/telemetry run ──────────────────────────────────────
    const { input_data, multiplier, slice_size } = body;
    const data: Float32Array =
      Array.isArray(input_data) && input_data.length > 0
        ? new Float32Array(input_data)
        : new Float32Array(generateSeedData(20));

    const result = gravelking_opt(data, multiplier, slice_size);
    const status = verifyParity(result.processed);

    return res.status(200).json({
      success: true,
      status,
      data: result,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default kernelRouter;
