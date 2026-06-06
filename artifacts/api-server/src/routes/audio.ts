import { Router, Request, Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { gravelking_opt, verifyParity } from "../kernel";
import { telemetryBus, type TelemetryEvent } from "../lib/telemetry";
import { db, processRunsTable } from "@workspace/db";

const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const audioRouter = Router();

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

// ── Local processing ──────────────────────────────────────────────────────────
async function decodeToFloat32(inputBuf: Buffer, ext: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const id = randomUUID();
  const inPath = `/tmp/gk_in_${id}.${ext}`;
  const outPath = `/tmp/gk_pcm_${id}.raw`;

  await writeFile(inPath, inputBuf);

  let sampleRate = 44100;
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", inPath]);
    const info = JSON.parse(stdout);
    const stream = info.streams?.find((s: any) => s.codec_type === "audio");
    if (stream) sampleRate = parseInt(stream.sample_rate) || 44100;
  } catch { /* use defaults */ }

  await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-f", "f32le", "-ac", "1", "-ar", String(sampleRate), "-acodec", "pcm_f32le", outPath]);
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
  await execFileAsync("ffmpeg", ["-y", "-f", "f32le", "-ar", String(sampleRate), "-ac", "1", "-i", inPath, "-acodec", "pcm_s16le", outPath]);
  const wavBuf = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return wavBuf;
}

// ── Telemetry SSE endpoint ────────────────────────────────────────────────────
audioRouter.get("/kernel/telemetry", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send a heartbeat every 25s to keep the connection alive through proxies
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

// ── Main processing endpoint ──────────────────────────────────────────────────
audioRouter.post(
  "/kernel/process-audio",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No audio file uploaded." });
      return;
    }

    const multiplier = parseFloat((req.body.multiplier as string) ?? "0.75");
    const sliceSize = parseInt((req.body.slice_size as string) ?? "2");

    // Try remote first
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
      const ext = (req.file.originalname.split(".").pop() ?? "mp3").toLowerCase();
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
