import { Router, type Request, type Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { sanitizeExt } from "../lib/audioGuards";
import { streamBuffer } from "../lib/streamResponse";
import { getUsageUser } from "../lib/usage";
import { checkExportQuota, consumeExport, exportLimitPayload } from "../lib/exportQuota";
import type { User } from "@workspace/db";

const execFileAsync = promisify(execFile);

const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) => cb(null, `gk_conv_${randomUUID()}.${sanitizeExt(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const convertRouter = Router();

type OutputFormat = "mp3" | "wav" | "flac" | "m4a" | "ogg";

// Default codec + per-format args; bitrate/sample rate are overridden below
// when the client supplies them.
const DEFAULT_RATE = 44100;
const VALID_RATES = [22050, 44100, 48000];
const DEFAULT_BITRATE_K: Record<OutputFormat, number> = {
  mp3: 320, wav: 1411, flac: 1411, m4a: 256, ogg: 192,
};
// Bitrate applies only to lossy formats (lossless WAV/FLAC are bitrate-free).
const LOSSLESS: Record<OutputFormat, boolean> = {
  mp3: false, wav: true, flac: true, m4a: false, ogg: false,
};

const FORMAT_CODEC: Record<OutputFormat, string[]> = {
  mp3:  ["-acodec", "libmp3lame"],
  wav:  ["-acodec", "pcm_s16le"],
  flac: ["-acodec", "flac"],
  m4a:  ["-acodec", "aac"],
  ogg:  ["-acodec", "libvorbis"],
};

function buildFormatArgs(
  format: OutputFormat,
  samplerate: number,
  bitrateK: number | null,
): string[] {
  const args = [...FORMAT_CODEC[format], "-ar", String(samplerate)];
  if (bitrateK !== null && !LOSSLESS[format]) {
    // OGG falls back to its own default in bitrate mode; q:a default omitted.
    if (format === "ogg") args.push("-b:a", `${bitrateK}k`);
    else args.push("-b:a", `${bitrateK}k`);
  }
  return args;
}

const MIME: Record<OutputFormat, string> = {
  mp3:  "audio/mpeg",
  wav:  "audio/wav",
  flac: "audio/flac",
  m4a:  "audio/mp4",
  ogg:  "audio/ogg",
};

/**
 * POST /api/convert
 * Accepts any audio or video file, extracts/converts the audio stream,
 * and returns the result in the requested format.
 *
 * Body (multipart/form-data):
 *   file     — the source file (audio or video)
 *   format   — output format: mp3 | wav | flac | m4a | ogg  (default: mp3)
 */
convertRouter.post(
  "/convert",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    const inputPath = req.file.path;
    const rawFormat = ((req.body.format as string) ?? "mp3").toLowerCase() as OutputFormat;
    const format: OutputFormat = FORMAT_CODEC[rawFormat] ? rawFormat : "mp3";

    // Sample rate (Hz) — whitelisted values, default 44100.
    const rawRate = Number(String(req.body.samplerate ?? "").trim());
    const samplerate = VALID_RATES.includes(rawRate) ? rawRate : DEFAULT_RATE;

    // Bitrate (kbps) — numeric, clamped to a sane range, ignored for lossless.
    const rawBitrate = Number(String(req.body.bitrateK ?? "").trim());
    const bitrateK = Number.isFinite(rawBitrate) && rawBitrate > 0
      ? Math.round(Math.min(320, Math.max(64, rawBitrate)))
      : null;

    // WAV/MP3 outputs count against the rolling 30-day export quota
    // (paid tiers included — capped, not unlimited).
    let exportUser: User | null = null;
    if (format === "wav" || format === "mp3") {
      exportUser = await getUsageUser(req, res);
      const quota = checkExportQuota(exportUser);
      if (!quota.allowed) {
        await unlink(inputPath).catch(() => {});
        res.status(429).json(exportLimitPayload(quota));
        return;
      }
    }

    const outId = randomUUID();
    const outPath = `/tmp/gk_conv_out_${outId}.${format}`;

    try {
      // -vn: strip video stream; ffmpeg handles any audio/video container as input
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", inputPath,
        "-vn",
        ...buildFormatArgs(format, samplerate, bitrateK),
        outPath,
      ], { timeout: 180_000, maxBuffer: 200 * 1024 * 1024 });

      const buf = await readFile(outPath);
      const baseName = req.file.originalname.replace(/\.[^.]+$/, "");

      // Consume only after a successful conversion.
      if (exportUser) {
        const quota = await consumeExport(exportUser);
        if (!quota.allowed) {
          res.status(429).json(exportLimitPayload(quota));
          return;
        }
      }

      res.setHeader("Content-Type", MIME[format]);
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.${format}"`);
      res.setHeader("X-GK-Format", format);
      streamBuffer(res, buf);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Conversion failed";
      res.status(500).json({ error: msg });
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outPath).catch(() => {});
    }
  },
);

export default convertRouter;
