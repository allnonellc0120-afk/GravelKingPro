import { Router, Request, Response } from "express";
import { streamBuffer } from "../lib/streamResponse";
import multer from "multer";
import { unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { probeFileDuration, sanitizeExt, normalizeToWav, MAX_AUDIO_DURATION_S } from "../lib/audioGuards";
import { hasUnlimitedMasters } from "../lib/entitlement";
import { getUsageUser, incrementUsage, FREE_LIMITS } from "../lib/usage";
import { applyMLKv3Fast } from "../kernel-v3";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { logToolError } from "../lib/errorTracker";
import { recordActivity } from "../lib/activityTracker";

/** Optional denoise stage folded into mastering (applied before the preset). */
const DENOISE_FILTER = "afftdn=nf=-25,anlmdn=s=7";

const execFileAsync = promisify(execFile);
const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) => {
      cb(null, `gk_master_${randomUUID()}.${sanitizeExt(file.originalname)}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB matches the audio route; 200 MB was unnecessarily large
});

// Clean up uploaded file after processing
async function cleanupUpload(path: string | undefined) {
  if (path) await unlink(path).catch(() => {});
}
const masterRouter = Router();
const objectStorage = new ObjectStorageService();

const masterRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 10 });
const masterConcurrency = concurrencyLimit(3);

export type MasterPreset =
  | "baseline"
  | "spacious"
  | "normal"
  | "broadcast"
  | "vinyl"
  | "podcast"
  | "club"
  | "film"
  | "youtube"
  | "soundcloud"
  | "apple";

const BASELINE_FILTER = "bass=g=1,loudnorm=I=-14:TP=-1:LRA=11";
const REVERB_SPACE = "aecho=0.8:0.7:40:0.25,extrastereo=m=1.4";

export const MASTER_PRESETS: Record<
  MasterPreset,
  { label: string; description: string; filter: string }
> = {
  baseline: {
    label: "Baseline",
    description: "Balanced master with a +10% low-end lift at YouTube loudness. The recommended starting point.",
    filter: BASELINE_FILTER,
  },
  spacious: {
    label: "Spacious",
    description: "Baseline + reverb & stereo space maker for width and depth.",
    filter: `bass=g=1,${REVERB_SPACE},loudnorm=I=-14:TP=-1:LRA=11`,
  },
  normal: {
    label: "Normal",
    description: "Baseline with slightly lower target loudness. Good for any content.",
    filter: "bass=g=1,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  broadcast: {
    label: "Broadcast",
    description: "Baseline + highpass + EBU R128 spec. Ideal for TV, radio, and streaming.",
    filter: "bass=g=1,highpass=f=80,loudnorm=I=-23:TP=-2:LRA=7",
  },
  vinyl: {
    label: "Vinyl",
    description: "Baseline + warm analog boost for lows and subtle air.",
    filter: "bass=g=3,treble=g=1,loudnorm=I=-16:TP=-1:LRA=13",
  },
  podcast: {
    label: "Podcast",
    description: "Baseline + highpass + dynamic compression for speech clarity.",
    filter:
      "bass=g=1,highpass=f=100,compand=attacks=0.01:decays=0.1:points=-70/-70|-30/-25|0/-5|20/-5,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  club: {
    label: "Club",
    description: "Baseline + heavy bass, punchy transients, and loud dance-floor energy.",
    filter:
      "bass=g=4,treble=g=2,compand=attacks=0.005:decays=0.05:points=-70/-70|-20/-15|0/-3|20/-3,loudnorm=I=-12:TP=-0.5:LRA=8",
  },
  film: {
    label: "Film",
    description: "Baseline + wide cinematic dynamics and dialogue presence.",
    filter:
      "bass=g=1,highpass=f=40,compand=attacks=0.05:decays=0.5:points=-70/-70|-40/-35|-20/-15|0/-5|20/-5,loudnorm=I=-24:TP=-2:LRA=15",
  },
  youtube: {
    label: "YouTube",
    description: "Baseline tuned for YouTube's -14 LUFS normalization.",
    filter: "bass=g=1,loudnorm=I=-14:TP=-1:LRA=11",
  },
  soundcloud: {
    label: "SoundCloud",
    description: "Baseline with louder target for SoundCloud uploads.",
    filter: "bass=g=1,loudnorm=I=-11:TP=-0.5:LRA=9",
  },
  apple: {
    label: "Apple Music",
    description: "Baseline tuned for Apple Sound Check at -16 LUFS.",
    filter: "bass=g=1,loudnorm=I=-16:TP=-1:LRA=11",
  },
};

const VALID_PRESETS = new Set(Object.keys(MASTER_PRESETS));

masterRouter.post(
  "/kernel/master",
  masterRateLimit,
  masterConcurrency,
  upload.single("audio"),
  async (req: Request, res: Response) => {
    // Log the moment the request enters the handler — if a crash happens before
    // the pino-http completion log fires, this entry at least shows the request
    // was received and what preset/file was requested.
    req.log.info(
      { preset: req.body?.preset, filename: req.file?.originalname, size: req.file?.size },
      "master request received"
    );
    recordActivity((req.cookies as Record<string, string>)?.["gk_session"], "Mastering Tool");

    if (!req.file) {
      res.status(400).json({ success: false, error: "No audio file uploaded." });
      return;
    }

    const presetName = (req.body.preset as string) || "baseline";
    if (!VALID_PRESETS.has(presetName)) {
      res.status(400).json({ success: false, error: `Unknown preset "${presetName}".` });
      return;
    }

    const preset = MASTER_PRESETS[presetName as MasterPreset];
    const denoise = (req.body.denoise as string) === "true";

    // weekly+ tiers get unlimited full-length masters. Free users get one full
    // download, then 30-second previews thereafter.
    const unlimited = await hasUnlimitedMasters(req);
    let isSample = false;
    let usageUserId: string | null = null;
    let usedTotalDownloads = 0;
    if (!unlimited) {
      const usageUser = await getUsageUser(req, res);
      usageUserId = usageUser.id;
      usedTotalDownloads = usageUser.totalDownloads ?? 0;
      const usedMaster = usageUser.freeMasterDownloads ?? 0;
      isSample = usedMaster >= FREE_LIMITS.freeMasterDownloads;
    }

    const uploadedPath = req.file.path;
    let filePath = uploadedPath;
    let normalizedPath: string | null = null;
    const outPath = `/tmp/gk_master_out_${randomUUID()}.wav`;

    try {
      // Normalize any format (m4a, mp4, mov, ogg, webm…) → WAV before the
      // preset chain. ffmpeg auto-detects the container so the user can drop
      // anything from their photo library and have it just work.
      normalizedPath = await normalizeToWav(uploadedPath);
      filePath = normalizedPath;

      // Duration guard
      const duration = await probeFileDuration(filePath);
      if (duration > MAX_AUDIO_DURATION_S) {
        res.status(422).json({
          success: false,
          error: `Audio exceeds the maximum allowed duration of ${Math.floor(MAX_AUDIO_DURATION_S / 60)} minutes.`,
        });
        return;
      }

      const filterChain = denoise ? `${DENOISE_FILTER},${preset.filter}` : preset.filter;
      const ffmpegArgs = [
        "-y",
        "-i", filePath,
        ...(isSample ? ["-t", "30"] : []),
        "-af", filterChain,
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        outPath,
      ];

      await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 100 * 1024 * 1024, timeout: 120_000 });

      // Count the free user's first full download against their allowance.
      if (!isSample && usageUserId) {
        if (usedTotalDownloads >= FREE_LIMITS.totalDownloads) {
          res.status(402).json({
            success: false,
            code: "LIMIT_REACHED",
            feature: "master",
            limit: FREE_LIMITS.totalDownloads,
            used: usedTotalDownloads,
            error: "You've used your free download. Subscribe to GravelKing Weekly for unlimited masters.",
            fallback: { action: "subscribe", url: "/pricing" },
          });
          return;
        }
        await incrementUsage(usageUserId, "freeMasterDownloads");
        await incrementUsage(usageUserId, "totalDownloads");
      }

      // Carve the mastered output through the MLK v3 kernel before returning it.
      // Runs entirely in ffmpeg (streaming on disk) so it completes in ~realtime
      // and never allocates the multi-GB JS arrays the in-process kernel needed.
      const { buf: carvedBuffer, parity } = await applyMLKv3Fast(outPath);

      const filename = `gravelking_mastered_${presetName}.wav`;

      if (isSample) {
        // Free tier: a 30-second preview. Always well under the Cloud Run ~32 MiB
        // response cap, so stream it straight back (chunked, no Content-Length).
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("X-GK-Mode", "master");
        res.setHeader("X-GK-Preset", presetName);
        res.setHeader("X-GK-Denoise", denoise ? "true" : "false");
        res.setHeader("X-GK-Sample", "true");
        res.setHeader("X-GK-Kernel", "MLK_v3");
        res.setHeader("X-GK-Parity", parity);
        streamBuffer(res, carvedBuffer);
        return;
      }

      // Full-length master (paid / unlimited tiers only). A 16-bit 44.1 kHz stereo
      // WAV can exceed the Cloud Run ~32 MiB response limit, which the Google
      // Frontend rejects with an empty 500 before our body is ever read. Persist the
      // result to object storage and hand back a signed URL so the browser downloads
      // straight from GCS — the audio never traverses Cloud Run.
      const key = `masters/${randomUUID()}.wav`;
      const url = await objectStorage.saveSignedDownload(key, carvedBuffer, "audio/wav", filename);

      res.json({
        success: true,
        url,
        filename,
        isSample: false,
        preset: presetName,
        denoise,
        kernel: "MLK_v3",
        parity,
        bytes: carvedBuffer.length,
      });
    } catch (err: any) {
      void logToolError("Mastering Tool", "MASTERING", err);
      res.status(500).json({ success: false, error: err.message ?? "Mastering failed." });
    } finally {
      await Promise.all([
        unlink(uploadedPath).catch(() => {}),
        normalizedPath ? unlink(normalizedPath).catch(() => {}) : Promise.resolve(),
        unlink(outPath).catch(() => {}),
      ]);
    }
  }
);

export default masterRouter;
