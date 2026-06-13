import { Router, Request, Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { zipSync } from "fflate";
import { gravelking_opt, verifyParity } from "../kernel";
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

// ── Remote routing ────────────────────────────────────────────────────────────
function getRemoteUrl(): string | null {
  return process.env.REMOTE_KERNEL_URL?.trim() || null;
}

function getRemoteApiKey(): string | null {
  return process.env.REMOTE_KERNEL_API_KEY?.trim() || null;
}

async function tryRemoteProcessing(
  file: Express.Multer.File,
  multiplier: number,
  sliceSize: number,
  stemId = 1
): Promise<{ wav: Buffer; headers: Record<string, string> } | null> {
  const remoteUrl = getRemoteUrl();
  if (!remoteUrl) return null;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-GravelKing-V3-Protocol": "REGENERATIVE_FLOW",
    "X-Stability-Quorum": "MONITOR_100",
    "X-Stem-ID": String(stemId),
    "X-GK-Multiplier": String(multiplier),
    "X-GK-Slice-Size": String(sliceSize),
  };

  const apiKey = getRemoteApiKey();
  if (apiKey) requestHeaders["Authorization"] = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`${remoteUrl}/process-audio`, {
      method: "POST",
      headers: requestHeaders,
      body: new Uint8Array(file.buffer),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("audio")) return null;

    const wav = Buffer.from(await response.arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    ["X-GK-Parity", "X-GK-Efficiency", "X-GK-Decay-Rate", "X-GK-Sample-Count"].forEach((h) => {
      const v = response.headers.get(h);
      if (v) responseHeaders[h] = v;
    });
    return { wav, headers: responseHeaders };
  } catch {
    return null;
  }
}

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
audioRouter.get("/kernel/routing", async (_req, res) => {
  const remoteUrl = getRemoteUrl();
  let remoteStatus: "online" | "offline" | "not_configured" = "not_configured";

  if (remoteUrl) {
    try {
      const r = await fetch(`${remoteUrl}/process-audio`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
        redirect: "error",
      });
      remoteStatus = r.ok ? "online" : "offline";
    } catch {
      remoteStatus = "offline";
    }
  }

  res.json({
    mode: remoteUrl ? "remote_with_fallback" : "local",
    remoteUrl: remoteUrl ?? null,
    remoteStatus,
    localKernel: "active",
    authConfigured: !!getRemoteApiKey(),
  });
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
          remoteUrl: getRemoteUrl(),
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
          remoteUrl: getRemoteUrl(),
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

    // ── Standard mode: try remote first ────────────────────────────────────────
    const remote = await tryRemoteProcessing(req.file, multiplier, sliceSize);
    if (remote) {
      const event: TelemetryEvent = {
        routing: "remote",
        parity: remote.headers["X-GK-Parity"] ?? "UNKNOWN",
        efficiency: remote.headers["X-GK-Efficiency"] ?? "—",
        decayRate: remote.headers["X-GK-Decay-Rate"] ?? "—",
        sampleCount: remote.headers["X-GK-Sample-Count"] ?? "—",
        timestamp: new Date().toISOString(),
        remoteUrl: getRemoteUrl(),
      };
      telemetryBus.emit("run", event);

      if (req.isAuthenticated()) {
        db.insert(processRunsTable).values({
          userId: req.user.id,
          routing: "remote",
          parity: remote.headers["X-GK-Parity"] ?? "UNKNOWN",
          efficiency: parseFloat(remote.headers["X-GK-Efficiency"] ?? "0") || null,
          decayRate: parseFloat(remote.headers["X-GK-Decay-Rate"] ?? "0") || null,
          sampleCount: parseInt(remote.headers["X-GK-Sample-Count"] ?? "0") || null,
          fileName: req.file.originalname,
        }).catch(() => {});
      }

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_processed.wav"`);
      res.setHeader("X-GK-Routing", "remote");
      Object.entries(remote.headers).forEach(([k, v]) => res.setHeader(k, v));
      res.send(remote.wav);
      return;
    }

    // Local kernel fallback
    try {
      const { samples, sampleRate } = await decodeToFloat32(req.file.buffer, ext);
      const result = gravelking_opt(Array.from(samples), multiplier, sliceSize);
      const parityStatus = verifyParity(result.processed);
      const wavBuffer = await encodeToWav(new Float32Array(result.processed), sampleRate);

      const event: TelemetryEvent = {
        routing: "local",
        parity: parityStatus,
        efficiency: result.stats.efficiency.toFixed(4),
        decayRate: result.stats.decayRate.toFixed(4),
        sampleCount: String(result.processed.length),
        timestamp: new Date().toISOString(),
        remoteUrl: getRemoteUrl(),
      };
      telemetryBus.emit("run", event);

      if (req.isAuthenticated()) {
        db.insert(processRunsTable).values({
          userId: req.user.id,
          routing: "local",
          parity: parityStatus,
          efficiency: result.stats.efficiency,
          decayRate: result.stats.decayRate,
          sampleCount: result.processed.length,
          fileName: req.file.originalname,
        }).catch(() => {});
      }

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_processed.wav"`);
      res.setHeader("X-GK-Routing", "local");
      res.setHeader("X-GK-Parity", parityStatus);
      res.setHeader("X-GK-Efficiency", result.stats.efficiency.toFixed(4));
      res.setHeader("X-GK-Decay-Rate", result.stats.decayRate.toFixed(4));
      res.setHeader("X-GK-Sample-Count", String(result.processed.length));
      res.send(wavBuffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default audioRouter;
