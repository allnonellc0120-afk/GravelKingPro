import { Router, Request, Response } from "express";
import multer from "multer";
import { unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { probeFileDuration, sanitizeExt, MAX_AUDIO_DURATION_S } from "../lib/audioGuards";
import { hasUnlimitedMasters } from "../lib/entitlement";
import { getUsageUser, incrementUsage, FREE_LIMITS } from "../lib/usage";
import { applyMLKv3Fast } from "../kernel-v3";

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

    const filePath = req.file.path;
    const outPath = `/tmp/gk_master_out_${randomUUID()}.wav`;

    try {
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

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_master_${presetName}.wav"`);
      res.setHeader("X-GK-Mode", "master");
      res.setHeader("X-GK-Preset", presetName);
      res.setHeader("X-GK-Denoise", denoise ? "true" : "false");
      res.setHeader("X-GK-Sample", isSample ? "true" : "false");
      res.setHeader("X-GK-Kernel", "MLK_v3");
      res.setHeader("X-GK-Parity", parity);
      res.send(carvedBuffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message ?? "Mastering failed." });
    } finally {
      await Promise.all([
        unlink(filePath).catch(() => {}),
        unlink(outPath).catch(() => {}),
      ]);
    }
  }
);

export default masterRouter;
