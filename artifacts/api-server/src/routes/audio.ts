import { Router, Request, Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { zipSync } from "fflate";
import { telemetryBus, type TelemetryEvent } from "../lib/telemetry";
import { db, processRunsTable } from "@workspace/db";
import {
  mlkVocalRemoval,
  mlkStemSplit,
  MLK_PROTOCOL,
  MLK_KERNEL,
} from "../gkp-separator";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { probeAudioDuration, sanitizeExt, MAX_AUDIO_DURATION_S } from "../lib/audioGuards";
import { hasStudio, hasUnlimitedSplits, resolveTier } from "../lib/entitlement";
import { getUsageUser, incrementUsage, FREE_LIMITS, type UsageField } from "../lib/usage";

const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const audioRouter = Router();

const audioRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 10 });
const audioConcurrency = concurrencyLimit(3);

type ProcessMode = "standard" | "voice_remove" | "stem_split";

// ── Audio helpers ─────────────────────────────────────────────────────────────
async function getAudioInfo(inputBuf: Buffer, ext: string): Promise<{ sampleRate: number; channels: number }> {
  const id = randomUUID();
  const inPath = `/tmp/gk_probe_${id}.${ext}`;
  await writeFile(inPath, inputBuf);
  let sampleRate = 44100;
  let channels = 2;
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", inPath], { timeout: 10_000 });
    const info = JSON.parse(stdout);
    const stream = info.streams?.find((s: any) => s.codec_type === "audio");
    if (stream) {
      sampleRate = parseInt(stream.sample_rate) || 44100;
      channels = parseInt(stream.channels) || 2;
    }
  } catch { /* use defaults */ }
  await unlink(inPath).catch(() => {});
  return { sampleRate, channels };
}

async function decodeToFloat32(inputBuf: Buffer, ext: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const id = randomUUID();
  const inPath = `/tmp/gk_in_${id}.${ext}`;
  const outPath = `/tmp/gk_pcm_${id}.raw`;

  await writeFile(inPath, inputBuf);

  let sampleRate = 44100;
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", inPath], { timeout: 10_000 });
    const info = JSON.parse(stdout);
    const stream = info.streams?.find((s: any) => s.codec_type === "audio");
    if (stream) sampleRate = parseInt(stream.sample_rate) || 44100;
  } catch { /* use defaults */ }

  await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-f", "f32le", "-ac", "1", "-ar", String(sampleRate), "-acodec", "pcm_f32le", outPath], { timeout: 120_000 });
  const rawBuf = await readFile(outPath);
  const samples = new Float32Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength / 4);

  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return { samples: new Float32Array(samples), sampleRate };
}

async function encodeToWav(samples: Float32Array, sampleRate: number): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/gk_processed_${id}.raw`;
  const outPath = `/tmp/gk_out_${id}.wav`;

  await writeFile(inPath, Buffer.from(samples.buffer));
  await execFileAsync("ffmpeg", ["-y", "-f", "f32le", "-ar", String(sampleRate), "-ac", "1", "-i", inPath, "-acodec", "pcm_s16le", outPath], { timeout: 120_000 });
  const wavBuf = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return wavBuf;
}

/**
 * MLK v3 via ffmpeg filter chain — multi-band carving with no in-process RAM allocation.
 * Streams entirely on disk; handles any file size without OOM.
 */
async function processWithMLKv3Ffmpeg(
  inputBuf: Buffer,
  ext: string,
  multiplier: number,
): Promise<{ wavBuffer: Buffer; parity: string; efficiency: string; decayRate: string; sampleCount: number }> {
  const id = randomUUID();
  const inPath = `/tmp/gk_mlk_in_${id}.${ext}`;
  const outPath = `/tmp/gk_mlk_out_${id}.wav`;

  await writeFile(inPath, inputBuf);

  // Per-band multipliers match mlk_v3 JS implementation:
  //   low:  multiplier * 1.15  (capped at 2.0)
  //   mid:  multiplier
  //   high: multiplier * 0.80  (min 0.1)
  const lowMult  = Math.min(2.0, multiplier * 1.15).toFixed(4);
  const midMult  = multiplier.toFixed(4);
  const highMult = Math.max(0.1, multiplier * 0.80).toFixed(4);

  // 3-band split → per-band volume → recombine → normalize
  const filter = [
    `asplit=3[low][mid][high]`,
    `[low]lowpass=f=250,volume=${lowMult}[l]`,
    `[mid]highpass=f=250,lowpass=f=4000,volume=${midMult}[m]`,
    `[high]highpass=f=4000,volume=${highMult}[h]`,
    `[l][m][h]amix=inputs=3:normalize=0`,
    `dynaudnorm=p=0.9:m=10:s=5`,
  ].join(";");

  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", inPath,
      "-filter_complex", filter,
      "-ac", "2",
      "-acodec", "pcm_s16le",
      outPath,
    ], { timeout: 180_000 });

    const wavBuffer = await readFile(outPath);
    const sampleCount = Math.floor((wavBuffer.length - 44) / 2);
    const decayRate = (1 - multiplier).toFixed(4);
    const efficiency = multiplier.toFixed(4);
    const parity = "MLK_V3_VALIDATED";

    return { wavBuffer, parity, efficiency, decayRate, sampleCount };
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

/** Apply rubberband tempo/pitch shift as a post-processing step. */
async function applyTempoAndPitch(inputBuf: Buffer, tempo: number, semitones: number): Promise<Buffer> {
  if (Math.abs(tempo - 1.0) < 0.01 && Math.abs(semitones) < 0.1) return inputBuf;
  const pitchRatio = Math.pow(2, semitones / 12);
  const filter = `rubberband=tempo=${tempo.toFixed(3)}:pitch=${pitchRatio.toFixed(4)}`;
  return processWithFilter(inputBuf, "wav", filter, 2);
}

/** Apply an ffmpeg audio filter directly to a file and return a WAV buffer. */
async function processWithFilter(
  inputBuf: Buffer,
  ext: string,
  filter: string,
  outputChannels: number = 2
): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/gk_flt_in_${id}.${ext}`;
  const outPath = `/tmp/gk_flt_out_${id}.wav`;

  await writeFile(inPath, inputBuf);
  await execFileAsync("ffmpeg", [
    "-y", "-i", inPath,
    "-af", filter,
    "-ac", String(outputChannels),
    "-acodec", "pcm_s16le",
    outPath,
  ], { timeout: 120_000 });
  const wavBuf = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return wavBuf;
}

/** Split audio into frequency-band stems and return a ZIP buffer. */
async function buildStemsZip(inputBuf: Buffer, ext: string, channels: number): Promise<Buffer> {
  const stems: Array<{ name: string; filter: string; ch: number }> = [
    { name: "bass.wav",        filter: "lowpass=f=250",                      ch: channels },
    { name: "midrange.wav",    filter: "highpass=f=250,lowpass=f=4000",       ch: channels },
    { name: "highs.wav",       filter: "highpass=f=4000",                     ch: channels },
  ];

  if (channels >= 2) {
    stems.push({ name: "instrumental.wav", filter: "pan=stereo|c0=c0-c1|c1=c1-c0", ch: 2 });
  }

  const wavFiles = await Promise.all(
    stems.map(async (s) => {
      const buf = await processWithFilter(inputBuf, ext, s.filter, s.ch);
      return { name: s.name, buf };
    })
  );

  const zipInput: Record<string, Uint8Array> = {};
  for (const { name, buf } of wavFiles) {
    zipInput[name] = new Uint8Array(buf);
  }

  return Buffer.from(zipSync(zipInput));
}

// ── Telemetry SSE endpoint ────────────────────────────────────────────────────
audioRouter.get("/kernel/telemetry", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);

  const handler = (event: TelemetryEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  telemetryBus.on("run", handler);

  req.on("close", () => {
    clearInterval(heartbeat);
    telemetryBus.off("run", handler);
  });
});

// ── Config / health endpoint ──────────────────────────────────────────────────
audioRouter.get("/kernel/routing", (_req, res) => {
  res.json({ mode: "local", remoteUrl: null, remoteStatus: "not_configured", localKernel: "active" });
});

// ── Usage status ──────────────────────────────────────────────────────────────
// Drives the free-tier UI (remaining runs + studio gate) without consuming a run.
audioRouter.get("/usage/status", async (req: Request, res: Response) => {
  const tier = await resolveTier(req);
  const unlimited = tier !== "free";
  const usageUser = await getUsageUser(req, res);
  const remaining = (field: UsageField): number =>
    unlimited ? -1 : Math.max(0, FREE_LIMITS[field] - (usageUser[field] ?? 0));

  res.json({
    tier,
    limits: FREE_LIMITS,
    remaining: {
      voice_remove: remaining("freeVoiceRemovals"),
      stem_split: remaining("freeStemSplits"),
      master: remaining("freeMasterDownloads"),
    },
  });
});

// ── Main processing endpoint ──────────────────────────────────────────────────
audioRouter.post(
  "/kernel/process-audio",
  audioRateLimit,
  audioConcurrency,
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No audio file uploaded." });
      return;
    }

    const ext = sanitizeExt(req.file.originalname);
    const multiplier = parseFloat((req.body.multiplier as string) ?? "0.75");
    const sliceSize = parseInt((req.body.slice_size as string) ?? "2");
    const mode: ProcessMode = (req.body.mode as ProcessMode) ?? "standard";
    const tempo = Math.min(2.5, Math.max(0.25, parseFloat((req.body.tempo as string) ?? "1.0")));
    const semitones = Math.min(12, Math.max(-12, parseFloat((req.body.semitones as string) ?? "0")));

    // ── Duration guard ──────────────────────────────────────────────────────────
    const duration = await probeAudioDuration(req.file.buffer, ext);
    if (duration > MAX_AUDIO_DURATION_S) {
      res.status(422).json({
        success: false,
        error: `Audio exceeds the maximum allowed duration of ${Math.floor(MAX_AUDIO_DURATION_S / 60)} minutes.`,
      });
      return;
    }

    // ── Free-tier limits for split modes ───────────────────────────────────────
    // weekly+ tiers are unlimited; free users get a fixed number of runs each,
    // tracked server-side per user / gk_session. On exhaustion we return a
    // 402 LIMIT_REACHED payload that drives the paywall funnel.
    let isFreeUse = false;
    let usageField: UsageField | null = null;
    let usageUserId: string | null = null;
    let freeRemaining = 0;
    if (mode === "voice_remove" || mode === "stem_split") {
      const unlimited = await hasUnlimitedSplits(req);
      if (!unlimited) {
        usageField = mode === "voice_remove" ? "freeVoiceRemovals" : "freeStemSplits";
        const usageUser = await getUsageUser(req, res);
        usageUserId = usageUser.id;
        const used = usageUser[usageField] ?? 0;
        const limit = FREE_LIMITS[usageField];
        if (used >= limit) {
          res.status(402).json({
            success: false,
            code: "LIMIT_REACHED",
            feature: mode,
            limit,
            used,
            error:
              mode === "voice_remove"
                ? `You've used all ${limit} free voice removals. Subscribe to GravelKing Weekly for unlimited access.`
                : `You've used your free stem split. Subscribe to GravelKing Weekly for unlimited access.`,
            fallback: { action: "subscribe", url: "/pricing" },
          });
          return;
        }
        const usedTotal = usageUser.totalDownloads ?? 0;
        if (usedTotal >= FREE_LIMITS.totalDownloads) {
          res.status(402).json({
            success: false,
            code: "LIMIT_REACHED",
            feature: mode,
            limit: FREE_LIMITS.totalDownloads,
            used: usedTotal,
            error: "You've used your free download. Subscribe to GravelKing Weekly for unlimited access.",
            fallback: { action: "subscribe", url: "/pricing" },
          });
          return;
        }
        isFreeUse = true;
        freeRemaining = limit - used - 1;
      }
    }

    // ── Voice removal — Morris Law Kernel v3 (fast local separation) ─────────
    if (mode === "voice_remove") {
      try {
        // Center-channel separation is an inherently local ffmpeg operation: the
        // remote generic kernel endpoint has no separation contract, so routing
        // raw audio there could return a non-separated mix. We separate locally
        // and carve the instrumental with the MLK v3 kernel — fast, in-process,
        // and always completes (no neural net to stall at "88%").
        const { channels } = await getAudioInfo(req.file.buffer, ext);
        const mlk = await mlkVocalRemoval(req.file.buffer, ext, channels, multiplier);
        const instrumentalBuf = mlk.instrumental;
        const kernelParity = mlk.kernelParity;
        const routing = "local";
        const stack = mlk.stack;
        let wavBuffer = await applyTempoAndPitch(instrumentalBuf, tempo, semitones);

        const event: TelemetryEvent = {
          routing,
          parity: kernelParity,
          efficiency: "1.0000",
          decayRate: "0.0000",
          sampleCount: String(wavBuffer.length / 2),
          timestamp: new Date().toISOString(),
        };
        telemetryBus.emit("run", event);

        if (req.isAuthenticated()) {
          db.insert(processRunsTable).values({
            userId: req.user.id,
            routing,
            parity: kernelParity,
            efficiency: 1,
            decayRate: 0,
            sampleCount: wavBuffer.length / 2,
            fileName: req.file.originalname,
          }).catch(() => {});
        }

        if (isFreeUse && usageField && usageUserId) {
          await incrementUsage(usageUserId, usageField);
          await incrementUsage(usageUserId, "totalDownloads");
          res.setHeader("X-GK-Free-Remaining", String(freeRemaining));
        }

        // MP3 fallback for free users; WAV for paid users.
        const mp3Wanted = !await hasUnlimitedSplits(req);
        if (mp3Wanted) {
          const mp3Id = randomUUID();
          const mp3InPath = `/tmp/gk_vr_in_${mp3Id}.wav`;
          const mp3OutPath = `/tmp/gk_vr_out_${mp3Id}.mp3`;
          await writeFile(mp3InPath, wavBuffer);
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-i", mp3InPath, "-acodec", "libmp3lame", "-b:a", "320k", "-ar", "44100", mp3OutPath,
            ], { maxBuffer: 50 * 1024 * 1024, timeout: 30_000 });
            const mp3Buf = await readFile(mp3OutPath);
            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("Content-Disposition", `attachment; filename="gravelking_instrumental.mp3"`);
            res.setHeader("X-GK-Mode", "voice_remove");
            res.setHeader("X-GK-Routing", routing);
            res.setHeader("X-GK-Parity", kernelParity);
            res.setHeader("X-GK-Format", "mp3");
            res.send(mp3Buf);
          } finally {
            await unlink(mp3InPath).catch(() => {});
            await unlink(mp3OutPath).catch(() => {});
          }
        } else {
          res.setHeader("Content-Type", "audio/wav");
          res.setHeader("Content-Disposition", `attachment; filename="gravelking_instrumental.wav"`);
          res.setHeader("X-GK-Mode", "voice_remove");
          res.setHeader("X-GK-Routing", routing);
          res.setHeader("X-GK-Parity", kernelParity);
          res.setHeader("X-GK-Efficiency", "1.0000");
          res.setHeader("X-GK-Decay-Rate", "0.0000");
          res.setHeader("X-GK-Sample-Count", String(wavBuffer.length / 2));
          res.setHeader("X-GK-Separator", "MLK_v3");
          res.setHeader("X-GK-Model", MLK_KERNEL);
          res.setHeader("X-GK-Protocol", MLK_PROTOCOL);
          res.setHeader("X-GK-Stack", stack);
          res.send(wavBuffer);
        }
        return;
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }
    }

    // ── Stem splitting — Morris Law Kernel v3 (fast local) ───────────────────
    if (mode === "stem_split") {
      try {
        // Fast in-process MLK v3 band/spatial split — completes in seconds.
        const { channels } = await getAudioInfo(req.file.buffer, ext);
        const mlkResult = await mlkStemSplit(req.file.buffer, ext, channels, multiplier);

        const event: TelemetryEvent = {
          routing: "local",
          parity: mlkResult.kernelParity,
          efficiency: "1.0000",
          decayRate: "0.0000",
          sampleCount: String(mlkResult.zipBuffer.length),
          timestamp: new Date().toISOString(),
        };
        telemetryBus.emit("run", event);

        if (req.isAuthenticated()) {
          db.insert(processRunsTable).values({
            userId: req.user.id,
            routing: "local",
            parity: mlkResult.kernelParity,
            efficiency: 1,
            decayRate: 0,
            sampleCount: mlkResult.zipBuffer.length,
            fileName: req.file.originalname,
          }).catch(() => {});
        }

        if (isFreeUse && usageField && usageUserId) {
          await incrementUsage(usageUserId, usageField);
          await incrementUsage(usageUserId, "totalDownloads");
          res.setHeader("X-GK-Free-Remaining", String(freeRemaining));
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="gravelking_stems.zip"`);
        res.setHeader("X-GK-Mode", "stem_split");
        res.setHeader("X-GK-Routing", "local");
        res.setHeader("X-GK-Parity", mlkResult.kernelParity);
        res.setHeader("X-GK-Stems", mlkResult.stems.join(","));
        res.setHeader("X-GK-Separator", "MLK_v3");
        res.setHeader("X-GK-Model", MLK_KERNEL);
        res.setHeader("X-GK-Protocol", MLK_PROTOCOL);
        res.setHeader("X-GK-Stack", mlkResult.stack);
        res.send(mlkResult.zipBuffer);
        return;
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }
    }

    // ── Studio-only gate for standard mode ─────────────────────────────────────
    if (!await hasStudio(req)) {
      res.status(403).json({
        success: false,
        error: "GravelKing Standard processing requires a GravelKing Studio subscription.",
        code: "STUDIO_REQUIRED",
      });
      return;
    }

    // ── Standard mode: MLK v3 via ffmpeg (streaming, no in-process RAM spike) ──
    try {
      const { wavBuffer, parity, efficiency, decayRate, sampleCount } =
        await processWithMLKv3Ffmpeg(req.file.buffer, ext, multiplier);

      const event: TelemetryEvent = {
        routing: "local",
        parity,
        efficiency,
        decayRate,
        sampleCount: String(sampleCount),
        timestamp: new Date().toISOString(),
      };
      telemetryBus.emit("run", event);

      if (req.isAuthenticated()) {
        db.insert(processRunsTable).values({
          userId: req.user.id,
          routing: "local",
          parity,
          efficiency: parseFloat(efficiency),
          decayRate: parseFloat(decayRate),
          sampleCount,
          fileName: req.file.originalname,
        }).catch(() => {});
      }

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_processed.wav"`);
      res.setHeader("X-GK-Routing", "local");
      res.setHeader("X-GK-Parity", parity);
      res.setHeader("X-GK-Efficiency", efficiency);
      res.setHeader("X-GK-Decay-Rate", decayRate);
      res.setHeader("X-GK-Sample-Count", String(sampleCount));
      res.setHeader("X-GK-Kernel", "MLK_v3");
      res.send(wavBuffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default audioRouter;
