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
  | "film"
  | "youtube"
  | "soundcloud"
  | "apple";

export const MASTER_PRESETS: Record<
  MasterPreset,
  { label: string; description: string; filter: string }
> = {
  normal: {
    label: "Normal",
    description: "Balanced loudness. Good starting point for any content.",
    filter: "loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  broadcast: {
    label: "Broadcast",
    description: "EBU R128 spec. Ideal for TV, radio, and streaming platforms.",
    filter: "highpass=f=80,loudnorm=I=-23:TP=-2:LRA=7",
  },
  vinyl: {
    label: "Vinyl",
    description: "Warm analog character with boosted lows and subtle air.",
    filter: "bass=g=3,treble=g=1,loudnorm=I=-16:TP=-1:LRA=13",
  },
  podcast: {
    label: "Podcast",
    description: "Voice clarity with dynamic compression. Perfect for speech.",
    filter:
      "highpass=f=100,compand=attacks=0.01:decays=0.1:points=-70/-70|-30/-25|0/-5|20/-5,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  club: {
    label: "Club",
    description: "Heavy bass, punchy transients, loud for dance-floor energy.",
    filter:
      "bass=g=4,treble=g=2,compand=attacks=0.005:decays=0.05:points=-70/-70|-20/-15|0/-3|20/-3,loudnorm=I=-12:TP=-0.5:LRA=8",
  },
  film: {
    label: "Film",
    description: "Wide cinematic dynamics. Dialogue clarity with presence.",
    filter:
      "highpass=f=40,compand=attacks=0.05:decays=0.5:points=-70/-70|-40/-35|-20/-15|0/-5|20/-5,loudnorm=I=-24:TP=-2:LRA=15",
  },
  youtube: {
    label: "YouTube",
    description: "Optimized for YouTube's -14 LUFS loudness normalization.",
    filter: "loudnorm=I=-14:TP=-1:LRA=11",
  },
  soundcloud: {
    label: "SoundCloud",
    description: "Loud and punchy at -11 LUFS for SoundCloud uploads.",
    filter: "loudnorm=I=-11:TP=-0.5:LRA=9",
  },
  apple: {
    label: "Apple Music",
    description: "Apple Sound Check standard at -16 LUFS.",
    filter: "loudnorm=I=-16:TP=-1:LRA=11",
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

    // Pro = "pro" or "node_auditor" tier; everyone else gets a 30-second sample
    const tier = (req.user as any)?.subscriptionTier ?? null;
    const isPro = tier === "pro" || tier === "node_auditor";
    const isSample = !isPro;

    const id = randomUUID();
    const ext = (req.file.originalname.split(".").pop() ?? "mp3").toLowerCase();
    const inPath = `/tmp/gk_master_in_${id}.${ext}`;
    const outPath = `/tmp/gk_master_out_${id}.wav`;

    try {
      await writeFile(inPath, req.file.buffer);

      const ffmpegArgs = [
        "-y",
        "-i", inPath,
        ...(isSample ? ["-t", "30"] : []),
        "-af", preset.filter,
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        outPath,
      ];

      await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 100 * 1024 * 1024 });

      const wavBuffer = await readFile(outPath);

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_master_${presetName}.wav"`);
      res.setHeader("X-GK-Mode", "master");
      res.setHeader("X-GK-Preset", presetName);
      res.setHeader("X-GK-Sample", isSample ? "true" : "false");
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
