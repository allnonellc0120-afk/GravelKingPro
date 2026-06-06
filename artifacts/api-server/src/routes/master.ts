import { Router, Request, Response } from "express";
import multer from "multer";
import { writeFile, readFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const masterRouter = Router();

export type MasterPreset =
  | "normal"
  | "broadcast"
  | "vinyl"
  | "podcast"
  | "club"
  | "film";

export const MASTER_PRESETS: Record<
  MasterPreset,
  { label: string; description: string; filter: string; free: boolean }
> = {
  normal: {
    label: "Normal",
    description: "Balanced loudness. Good starting point for any content.",
    filter: "loudnorm=I=-16:TP=-1.5:LRA=11",
    free: true,
  },
  broadcast: {
    label: "Broadcast",
    description: "EBU R128 spec. Ideal for TV, radio, and streaming platforms.",
    filter: "highpass=f=80,loudnorm=I=-23:TP=-2:LRA=7",
    free: false,
  },
  vinyl: {
    label: "Vinyl",
    description: "Warm analog character with boosted lows and subtle air.",
    filter: "bass=g=3,treble=g=1,loudnorm=I=-16:TP=-1:LRA=13",
    free: false,
  },
  podcast: {
    label: "Podcast",
    description: "Voice clarity with dynamic compression. Perfect for speech.",
    filter:
      "highpass=f=100,compand=attacks=0.01:decays=0.1:points=-70/-70|-30/-25|0/-5|20/-5,loudnorm=I=-16:TP=-1.5:LRA=11",
    free: false,
  },
  club: {
    label: "Club",
    description: "Heavy bass, punchy transients, loud for dance-floor energy.",
    filter:
      "bass=g=4,treble=g=2,compand=attacks=0.005:decays=0.05:points=-70/-70|-20/-15|0/-3|20/-3,loudnorm=I=-12:TP=-0.5:LRA=8",
    free: false,
  },
  film: {
    label: "Film",
    description: "Wide cinematic dynamics. Dialogue clarity with presence.",
    filter:
      "highpass=f=40,compand=attacks=0.05:decays=0.5:points=-70/-70|-40/-35|-20/-15|0/-5|20/-5,loudnorm=I=-24:TP=-2:LRA=15",
    free: false,
  },
};

const VALID_PRESETS = new Set(Object.keys(MASTER_PRESETS));

masterRouter.post(
  "/kernel/master",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No audio file uploaded." });
      return;
    }

    const presetName = (req.body.preset as string) || "normal";
    if (!VALID_PRESETS.has(presetName)) {
      res.status(400).json({ success: false, error: `Unknown preset "${presetName}".` });
      return;
    }

    const preset = MASTER_PRESETS[presetName as MasterPreset];

    // Free preset gate: only authenticated users with a paid tier can use non-free presets
    if (!preset.free) {
      const tier = (req.user as any)?.subscriptionTier ?? null;
      const isAuthenticated = req.isAuthenticated();
      const hasPaidTier = isAuthenticated && !!tier;
      if (!hasPaidTier) {
        res.status(403).json({
          success: false,
          error: "This mastering preset requires a GravelKing Splits or Pro subscription.",
        });
        return;
      }
    }

    const id = randomUUID();
    const ext = (req.file.originalname.split(".").pop() ?? "mp3").toLowerCase();
    const inPath = `/tmp/gk_master_in_${id}.${ext}`;
    const outPath = `/tmp/gk_master_out_${id}.wav`;

    try {
      await writeFile(inPath, req.file.buffer);

      await execFileAsync("ffmpeg", [
        "-y",
        "-i", inPath,
        "-af", preset.filter,
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        outPath,
      ], { maxBuffer: 100 * 1024 * 1024 });

      const wavBuffer = await readFile(outPath);

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_master_${presetName}.wav"`);
      res.setHeader("X-GK-Mode", "master");
      res.setHeader("X-GK-Preset", presetName);
      res.send(wavBuffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message ?? "Mastering failed." });
    } finally {
      await Promise.all([
        unlink(inPath).catch(() => {}),
        unlink(outPath).catch(() => {}),
      ]);
    }
  }
);

export default masterRouter;
