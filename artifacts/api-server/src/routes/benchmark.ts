/**
 * Admin-only, on-demand performance benchmarks for the partner dashboard.
 *
 * Two protected surfaces:
 *   POST /api/admin/benchmark/kernel — times the REAL Morris Law Kernel v3.5
 *     execution path (remote Cloud Run first, local Python worker fallback —
 *     the exact selection logic /api/kernel/master uses) against a bounded,
 *     generated WAV fixture. Reports per-run timing, min/median/max, audio
 *     duration, realtime multiplier, and which engine actually ran.
 *   POST /api/admin/benchmark/e2e — performs a REAL partner-path request:
 *     multipart POST of the fixture to this server's own /api/v1/ingest with
 *     the partner API key, then decomposes wall-clock time into upload/parse,
 *     kernel, other server work, and network+response using the server's
 *     X-GK-Timing-* headers.
 *
 * Guardrails: admin auth, per-IP rate limit, concurrency 1, fixture duration
 * capped at 10 s, run count capped at 5, and guaranteed /tmp cleanup. Nothing
 * here fabricates numbers — failures are returned as failures.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, stat, unlink } from "fs/promises";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { performance } from "perf_hooks";
import { requireAdmin } from "../lib/adminAuth";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { partnerApiKey } from "./master";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const benchRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  max: 6,
  message: "Benchmark rate limit reached (6 per 10 minutes). Try again shortly.",
});
const benchConcurrency = concurrencyLimit(1, "A benchmark is already running. Wait for it to finish.");

const MAX_RUNS = 5;
const MAX_FIXTURE_SECONDS = 10;

/** Generate a bounded true-stereo WAV fixture (distinct L/R sines + light noise). */
async function makeFixture(seconds: number): Promise<string> {
  const out = `/tmp/gk_bench_fix_${randomUUID()}.wav`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=523:duration=${seconds}`,
    "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo,volume=0.8[a]",
    "-map", "[a]", "-acodec", "pcm_s16le", "-ar", "44100", out,
  ], { timeout: 30_000 });
  return out;
}

function summarize(values: number[]): { min: number; median: number; max: number } {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { min: s[0], median, max: s[s.length - 1] };
}

/**
 * Run the SAME Morris Law Kernel v3.5 selection the mastering route uses:
 * remote Cloud Run service when MLK_KERNEL_URL is set and reachable, otherwise
 * the local Python worker subprocess. Returns which engine actually processed.
 */
async function runKernelOnce(
  inputPath: string,
  outPath: string,
): Promise<{ engine: "cloud-run" | "local"; numba: boolean; ms: number }> {
  const remoteBase = process.env.MLK_KERNEL_URL?.replace(/\/$/, "");
  const kernelArgs = {
    preset: "natural_body", intensity: "75", sidechainFilter: "highpass",
    sidechainFreq: "160", stereoLink: "true", adaptiveMode: "bass_aware",
    autoThreshold: "false", autoOffset: "-16", targetLufs: "-14", ceilingDb: "-0.8",
  };

  if (remoteBase) {
    try {
      const audioBytes = await readFile(inputPath);
      const form = new FormData();
      form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "input.wav");
      form.append("preset", kernelArgs.preset);
      form.append("intensity", kernelArgs.intensity);
      form.append("sidechain_filter", kernelArgs.sidechainFilter);
      form.append("sidechain_freq", kernelArgs.sidechainFreq);
      form.append("stereo_link", kernelArgs.stereoLink);
      form.append("adaptive_mode", kernelArgs.adaptiveMode);
      form.append("auto_threshold", kernelArgs.autoThreshold);
      form.append("auto_offset", kernelArgs.autoOffset);
      form.append("target_lufs", kernelArgs.targetLufs);
      form.append("ceiling_db", kernelArgs.ceilingDb);
      const headers: Record<string, string> = {};
      const apiKey = process.env.REMOTE_KERNEL_API_KEY;
      if (apiKey) headers["x-api-key"] = apiKey;
      const t0 = performance.now();
      const resp = await fetch(`${remoteBase}/master`, {
        method: "POST", headers, body: form, signal: AbortSignal.timeout(120_000),
      });
      if (!resp.ok) throw new Error(`remote kernel HTTP ${resp.status}`);
      await writeFile(outPath, Buffer.from(await resp.arrayBuffer()));
      const ms = performance.now() - t0;
      return { engine: "cloud-run", numba: resp.headers.get("x-mlk-numba") === "true", ms };
    } catch {
      // fall through to local worker — same kernel code
    }
  }

  const pyWorker = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
  const t0 = performance.now();
  const { stdout } = await execFileAsync("python3", [
    pyWorker,
    "--input", inputPath,
    "--output", outPath,
    "--preset", kernelArgs.preset,
    "--intensity", kernelArgs.intensity,
    "--sidechain-filter", kernelArgs.sidechainFilter,
    "--sidechain-freq", kernelArgs.sidechainFreq,
    "--stereo-link", kernelArgs.stereoLink,
    "--adaptive-mode", kernelArgs.adaptiveMode,
    "--auto-threshold", kernelArgs.autoThreshold,
    "--auto-offset", kernelArgs.autoOffset,
    "--target-lufs", kernelArgs.targetLufs,
    "--ceiling-db", kernelArgs.ceilingDb,
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 });
  const ms = performance.now() - t0;
  const stats = JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as { numba?: boolean };
  return { engine: "local", numba: stats.numba === true, ms };
}

function boundedInt(v: unknown, def: number, min: number, max: number): number | null {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

// ── POST /api/admin/benchmark/kernel ─────────────────────────────────────────
router.post(
  "/admin/benchmark/kernel",
  benchRateLimit,
  benchConcurrency,
  async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const runs = boundedInt((req.body as Record<string, unknown>)?.runs, 3, 1, MAX_RUNS);
    const durationS = boundedInt((req.body as Record<string, unknown>)?.durationS, 5, 1, MAX_FIXTURE_SECONDS);
    if (runs === null || durationS === null) {
      res.status(400).json({
        success: false,
        error: `Invalid parameters. runs must be an integer 1–${MAX_RUNS}; durationS an integer 1–${MAX_FIXTURE_SECONDS}.`,
      });
      return;
    }

    const cleanup: string[] = [];
    try {
      const fixturePath = await makeFixture(durationS);
      cleanup.push(fixturePath);
      const fixtureBytes = (await stat(fixturePath)).size;

      const results: Array<{ run: number; processingMs: number; engine: string; numba: boolean; completedAt: string }> = [];
      for (let i = 0; i < runs; i++) {
        const outPath = `/tmp/gk_bench_out_${randomUUID()}.wav`;
        cleanup.push(outPath);
        const r = await runKernelOnce(fixturePath, outPath);
        results.push({
          run: i + 1,
          processingMs: Math.round(r.ms),
          engine: r.engine,
          numba: r.numba,
          completedAt: new Date().toISOString(),
        });
      }

      const s = summarize(results.map((r) => r.processingMs));
      const realtimeMultiplier = s.median > 0 ? (durationS * 1000) / s.median : null;

      res.json({
        success: true,
        measuredAt: new Date().toISOString(),
        fixture: { durationS, bytes: fixtureBytes, kind: "generated true-stereo sine WAV" },
        kernel: "Morris Law Kernel v3.5",
        engine: results[results.length - 1].engine,
        completedLocally: results.every((r) => r.engine === "local"),
        runs: results,
        summary: {
          runs,
          minMs: Math.round(s.min),
          medianMs: Math.round(s.median),
          maxMs: Math.round(s.max),
          realtimeMultiplier: realtimeMultiplier === null ? null : Math.round(realtimeMultiplier * 10) / 10,
        },
        note: "Kernel processing time only — excludes network, upload, and HTTP overhead. Fixture is short synthetic audio; real tracks are longer and heavier.",
      });
    } catch (err) {
      req.log.error({ err: String(err).slice(0, 300) }, "kernel benchmark failed");
      res.status(500).json({ success: false, error: `Benchmark failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      await Promise.all(cleanup.map((p) => unlink(p).catch(() => {})));
    }
  },
);

// ── POST /api/admin/benchmark/e2e ────────────────────────────────────────────
// Real partner-path measurement: POST the fixture to this server's own
// /api/v1/ingest with the partner API key and decompose the timings.
router.post(
  "/admin/benchmark/e2e",
  benchRateLimit,
  benchConcurrency,
  async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    const durationS = boundedInt((req.body as Record<string, unknown>)?.durationS, 5, 1, MAX_FIXTURE_SECONDS);
    if (durationS === null) {
      res.status(400).json({ success: false, error: `Invalid durationS. Expected an integer 1–${MAX_FIXTURE_SECONDS}.` });
      return;
    }

    const key = partnerApiKey();
    const port = process.env.PORT;
    if (!key || !port) {
      res.status(503).json({ success: false, error: "Partner key or server port unavailable — cannot run the partner-path test." });
      return;
    }

    const cleanup: string[] = [];
    try {
      const fixturePath = await makeFixture(durationS);
      cleanup.push(fixturePath);
      const fixtureBytes = (await stat(fixturePath)).size;
      const audioBytes = await readFile(fixturePath);

      const form = new FormData();
      form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "benchmark_fixture.wav");
      form.append("preset", "baseline");

      const t0 = performance.now();
      const resp = await fetch(`http://127.0.0.1:${port}/api/v1/ingest`, {
        method: "POST",
        headers: { "x-api-key": key },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
      const bodyBuf = Buffer.from(await resp.arrayBuffer());
      const totalMs = performance.now() - t0;

      if (!resp.ok) {
        res.status(502).json({
          success: false,
          error: `Partner ingest returned HTTP ${resp.status}: ${bodyBuf.toString("utf8").slice(0, 200)}`,
        });
        return;
      }

      const num = (h: string): number | null => {
        const n = parseFloat(resp.headers.get(h) ?? "");
        return Number.isFinite(n) ? Math.round(n) : null;
      };
      const uploadMs = num("x-gk-timing-upload-ms");
      const kernelMs = num("x-gk-timing-kernel-ms");
      const serverMs = num("x-gk-timing-server-ms");

      res.json({
        success: true,
        measuredAt: new Date().toISOString(),
        fixture: { durationS, bytes: fixtureBytes, kind: "generated true-stereo sine WAV" },
        endpoint: "POST /api/v1/ingest (loopback — excludes public internet latency)",
        kernelEngine: resp.headers.get("x-gk-kernelengine"),
        outputBytes: bodyBuf.length,
        timings: {
          totalMs: Math.round(totalMs),
          uploadAndParseMs: uploadMs,
          kernelMs,
          serverOtherMs: serverMs !== null && kernelMs !== null && uploadMs !== null
            ? Math.max(0, serverMs - kernelMs - uploadMs)
            : null,
          serverTotalMs: serverMs,
          networkAndResponseMs: serverMs !== null ? Math.max(0, Math.round(totalMs - serverMs)) : null,
        },
        note: "Loopback measurement: real multipart upload, real kernel, real response stream — but no public internet in the path.",
      });
    } catch (err) {
      req.log.error({ err: String(err).slice(0, 300) }, "e2e benchmark failed");
      res.status(500).json({ success: false, error: `End-to-end test failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      await Promise.all(cleanup.map((p) => unlink(p).catch(() => {})));
    }
  },
);

export default router;
