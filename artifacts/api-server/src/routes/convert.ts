import { Router, type Request, type Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { sanitizeExt } from "../lib/audioGuards";

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

const FORMAT_ARGS: Record<OutputFormat, string[]> = {
  mp3:  ["-acodec", "libmp3lame", "-b:a", "320k", "-ar", "44100"],
  wav:  ["-acodec", "pcm_s16le", "-ar", "44100"],
  flac: ["-acodec", "flac", "-ar", "44100"],
  m4a:  ["-acodec", "aac", "-b:a", "256k", "-ar", "44100"],
  ogg:  ["-acodec", "libvorbis", "-q:a", "8", "-ar", "44100"],
};

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
    const format: OutputFormat = FORMAT_ARGS[rawFormat] ? rawFormat : "mp3";

    const outId = randomUUID();
    const outPath = `/tmp/gk_conv_out_${outId}.${format}`;

    try {
      // -vn: strip video stream; ffmpeg handles any audio/video container as input
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", inputPath,
        "-vn",
        ...FORMAT_ARGS[format],
        outPath,
      ], { timeout: 180_000, maxBuffer: 200 * 1024 * 1024 });

      const buf = await readFile(outPath);
      const baseName = req.file.originalname.replace(/\.[^.]+$/, "");

      res.setHeader("Content-Type", MIME[format]);
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.${format}"`);
      res.setHeader("X-GK-Format", format);
      res.send(buf);
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
