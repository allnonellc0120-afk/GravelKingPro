import { Router, Request, Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { probeFileDuration, sanitizeExt, MAX_AUDIO_DURATION_S } from "../lib/audioGuards";
import { hasPaidSubscription } from "../lib/entitlement";

const execFileAsync = promisify(execFile);

const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) => {
      const ext = sanitizeExt(file.originalname);
      cb(null, `gk_mix_in_${randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 8 },
});

const studioRouter = Router();

const studioRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 5 });
const studioConcurrency = concurrencyLimit(2);

type VoicePreset = {
  semitoneOffset: number;
  extraFilters: string[];
};

const VOICE_PRESETS: Record<string, VoicePreset> = {
  normal:   { semitoneOffset: 0,  extraFilters: [] },
  robot:    { semitoneOffset: -2, extraFilters: ["vibrato=f=30:d=0.85"] },
  chipmunk: { semitoneOffset: 10, extraFilters: [] },
  deep:     { semitoneOffset: -9, extraFilters: [] },
  alien:    { semitoneOffset: 5,  extraFilters: ["aecho=0.8:0.9:50:0.4", "vibrato=f=6:d=0.5"] },
};

function buildAtempo(speed: number): string {
  if (speed >= 0.5 && speed <= 2.0) return `atempo=${speed.toFixed(4)}`;
  if (speed < 0.5) {
    const half = Math.max(speed / 0.5, 0.5);
    return `atempo=0.5,atempo=${half.toFixed(4)}`;
  }
  if (speed <= 4.0) {
    const half = Math.min(speed / 2.0, 2.0);
    return `atempo=2.0,atempo=${half.toFixed(4)}`;
  }
  return `atempo=2.0,atempo=2.0`;
}

studioRouter.post(
  "/kernel/studio-mix",
  studioRateLimit,
  studioConcurrency,
  upload.array("tracks", 8),
  async (req: Request, res: Response) => {
    // ── Pro subscription gate ────────────────────────────────────────────────────
    if (!await hasPaidSubscription(req)) {
      res.status(403).json({
        success: false,
        error: "Mix Studio export requires a Pro subscription.",
        code: "PRO_REQUIRED",
      });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) {
      res.status(400).json({ success: false, error: "No audio files uploaded." });
      return;
    }

    // Collect all disk paths written by multer for cleanup in finally
    const tmpFiles: string[] = files.map((f) => f.path);

    const id = randomUUID();
    const outputPath = `/tmp/gk_mix_out_${id}.wav`;
    tmpFiles.push(outputPath);

    try {
      // Validate each track: extension + duration
      for (const file of files) {
        const ext = sanitizeExt(file.originalname);
        if (ext === "mid" || ext === "midi") {
          res.status(422).json({ success: false, error: "MIDI files require a soundfont synthesizer. Please convert to WAV or MP3 first." });
          return;
        }
        const duration = await probeFileDuration(file.path);
        if (duration > MAX_AUDIO_DURATION_S) {
          res.status(422).json({
            success: false,
            error: `Track "${file.originalname}" exceeds the maximum allowed duration of ${Math.floor(MAX_AUDIO_DURATION_S / 60)} minutes.`,
          });
          return;
        }
      }

      const arrangement = (req.body.arrangement as string) === "layer" ? "layer" : "sequential";
      const speed       = Math.min(Math.max(parseFloat(req.body.speed ?? "1") || 1, 0.25), 4.0);
      const semitones   = Math.min(Math.max(parseInt(req.body.semitones ?? "0") || 0, -24), 24);
      const noiseReduce = (req.body.noiseReduce as string) || "off";
      const voicePreset = (req.body.voicePreset as string) || "normal";

      const preset = VOICE_PRESETS[voicePreset] ?? VOICE_PRESETS.normal;
      const totalSemitones = semitones + preset.semitoneOffset;
      const pitchRatio = Math.pow(2, totalSemitones / 12);
      const clampedPitch = Math.min(Math.max(pitchRatio, 0.1), 4.0);
      const clampedSpeed = Math.min(Math.max(speed, 0.25), 4.0);

      // Use the paths multer already wrote to disk
      const inputPaths = files.map((f) => f.path);
      const n = inputPaths.length;

      // Build ffmpeg args
      const ffmpegArgs: string[] = ["-y"];
      for (const p of inputPaths) {
        ffmpegArgs.push("-i", p);
      }

      const filterParts: string[] = [];

      // Normalize each input to 44100 stereo
      for (let i = 0; i < n; i++) {
        filterParts.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[norm${i}]`);
      }

      // Arrange tracks
      let prevStream: string;
      if (n === 1) {
        prevStream = "[norm0]";
      } else if (arrangement === "sequential") {
        const ins = Array.from({ length: n }, (_, i) => `[norm${i}]`).join("");
        filterParts.push(`${ins}concat=n=${n}:v=0:a=1[arr]`);
        prevStream = "[arr]";
      } else {
        const ins = Array.from({ length: n }, (_, i) => `[norm${i}]`).join("");
        filterParts.push(`${ins}amix=inputs=${n}:duration=longest:normalize=0[arr]`);
        prevStream = "[arr]";
      }

      // Build effect chain
      const effects: string[] = [];

      const needPitch = Math.abs(clampedPitch - 1.0) > 0.0005;
      const needSpeed = Math.abs(clampedSpeed - 1.0) > 0.0005;

      if (needPitch && needSpeed) {
        effects.push(`rubberband=tempo=${clampedSpeed.toFixed(4)}:pitch=${clampedPitch.toFixed(6)}`);
      } else if (needPitch) {
        effects.push(`rubberband=tempo=1.0:pitch=${clampedPitch.toFixed(6)}`);
      } else if (needSpeed) {
        effects.push(buildAtempo(clampedSpeed));
      }

      for (const f of preset.extraFilters) {
        effects.push(f);
      }

      if (noiseReduce === "light") effects.push("afftdn=nf=-20");
      else if (noiseReduce === "heavy") effects.push("afftdn=nf=-35,anlmdn");

      const effectStr = effects.length > 0 ? effects.join(",") : "anull";
      filterParts.push(`${prevStream}${effectStr}[aout]`);

      ffmpegArgs.push(
        "-filter_complex", filterParts.join(";"),
        "-map", "[aout]",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        outputPath
      );

      await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 200 * 1024 * 1024, timeout: 120_000 });

      // Stream the output file directly to avoid loading entire WAV into memory
      const { createReadStream } = await import("fs");
      const { stat } = await import("fs/promises");
      const { size } = await stat(outputPath);

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_mix.wav"`);
      res.setHeader("Content-Length", String(size));
      res.setHeader("X-GK-Mode", "studio-mix");
      res.setHeader("X-GK-Routing", "local");
      res.setHeader("X-GK-Track-Count", String(n));
      res.setHeader("X-GK-Arrangement", arrangement);

      const stream = createReadStream(outputPath);
      stream.pipe(res);
      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
      });
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message ?? "Studio mix failed." });
      }
    } finally {
      await Promise.all(tmpFiles.map((f) => unlink(f).catch(() => {})));
    }
  }
);

export default studioRouter;
