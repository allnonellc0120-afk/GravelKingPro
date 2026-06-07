import { Router, Request, Response } from "express";
import { writeFile, readFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { mlk_v3, bufferToFloat32, float32ToBuffer } from "../kernel-v3";

const execFileAsync = promisify(execFile);
const beatRouter = Router();

type MusicKey = "C" | "D" | "E" | "F" | "G" | "A" | "B";
type Genre = "hiphop" | "rnb" | "electronic" | "lofi" | "trap" | "pop" | "soul";

const ROOT_FREQ: Record<MusicKey, { bass: number; root: number }> = {
  C: { bass: 65.41,  root: 261.63 },
  D: { bass: 73.42,  root: 293.66 },
  E: { bass: 82.41,  root: 329.63 },
  F: { bass: 87.31,  root: 349.23 },
  G: { bass: 98.00,  root: 392.00 },
  A: { bass: 110.00, root: 440.00 },
  B: { bass: 123.47, root: 493.88 },
};

const MAJOR3 = 2 ** (4 / 12);
const PERF5  = 2 ** (7 / 12);

const GENRE_EQ: Record<Genre, string> = {
  hiphop:     "bass=g=6,highpass=f=50",
  rnb:        "bass=g=3,treble=g=1",
  electronic: "treble=g=4,bass=g=2",
  lofi:       "lowpass=f=3000,bass=g=2",
  trap:       "bass=g=9,highpass=f=40",
  pop:        "treble=g=2,bass=g=2,loudnorm=I=-14:TP=-1:LRA=11",
  soul:       "bass=g=4,treble=g=-1",
};

const VALID_KEYS  = new Set(Object.keys(ROOT_FREQ));
const VALID_GENRES = new Set(["hiphop", "rnb", "electronic", "lofi", "trap", "pop", "soul"]);

beatRouter.post("/beatmaker/generate", async (req: Request, res: Response) => {
  const key     = ((req.body.key    as string) || "C").toUpperCase() as MusicKey;
  const genre   = ((req.body.genre  as string) || "hiphop") as Genre;
  const bpm     = Math.max(60, Math.min(200, parseInt(req.body.bpm ?? "95", 10)));
  const mood    = (req.body.mood as string) || "chill";
  const tier    = (req.user as any)?.subscriptionTier ?? null;
  const isPro   = tier === "pro" || tier === "node_auditor";

  // Free: 30 s sample — Pro: up to 120 s
  const requestedDur = parseInt(req.body.duration ?? "30", 10);
  const duration = isPro ? Math.max(5, Math.min(120, requestedDur)) : 30;

  if (!VALID_KEYS.has(key)) {
    res.status(400).json({ success: false, error: `Invalid key "${key}".` });
    return;
  }
  if (!VALID_GENRES.has(genre)) {
    res.status(400).json({ success: false, error: `Invalid genre "${genre}".` });
    return;
  }

  const { bass, root } = ROOT_FREQ[key];
  const third  = root * MAJOR3;
  const fifth  = root * PERF5;
  const beatHz = bpm / 60;
  const eq     = GENRE_EQ[genre];

  const id      = randomUUID();
  const rawPath = `/tmp/gkp_beat_raw_${id}.wav`;
  const outPath = `/tmp/gkp_beat_out_${id}.wav`;
  const pcmPath = `/tmp/gkp_beat_pcm_${id}.raw`;

  try {
    // ── Synthesis via ffmpeg lavfi sine sources ──────────────────────────
    const bassFilter  = `[0:a]${eq},volume=0.65,tremolo=f=${beatHz.toFixed(3)}:d=0.70[b]`;
    const rootFilter  = `[1:a]volume=0.18,tremolo=f=${(beatHz / 2).toFixed(3)}:d=0.30[r]`;
    const thirdFilter = `[2:a]volume=0.14,tremolo=f=${(beatHz / 2).toFixed(3)}:d=0.30[t]`;
    const fifthFilter = `[3:a]volume=0.13,tremolo=f=${(beatHz / 2).toFixed(3)}:d=0.30[f]`;
    const mixFilter   = `[b][r][t][f]amix=inputs=4:duration=first,loudnorm=I=-14:TP=-1:LRA=11`;

    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", `sine=frequency=${bass.toFixed(2)}:duration=${duration}`,
      "-f", "lavfi", "-i", `sine=frequency=${root.toFixed(2)}:duration=${duration}`,
      "-f", "lavfi", "-i", `sine=frequency=${third.toFixed(2)}:duration=${duration}`,
      "-f", "lavfi", "-i", `sine=frequency=${fifth.toFixed(2)}:duration=${duration}`,
      "-filter_complex", `${bassFilter};${rootFilter};${thirdFilter};${fifthFilter};${mixFilter}`,
      "-ac", "2", "-ar", "44100", "-acodec", "pcm_s16le",
      rawPath,
    ], { maxBuffer: 100 * 1024 * 1024 });

    // ── MLK v3 kernel processing ─────────────────────────────────────────
    const rawWav = await readFile(rawPath);

    // pcm_s16le WAV: skip the 44-byte WAV header
    const pcmData = rawWav.slice(44);
    const samples = bufferToFloat32(pcmData);

    const multiplier = mood === "aggressive" ? 1.8
      : mood === "dark" ? 1.4
      : mood === "uplifting" ? 0.85
      : mood === "chill" ? 0.65
      : 0.75;

    const { processed, stats } = mlk_v3(samples, multiplier, 2);
    const processedPcm = float32ToBuffer(processed);

    // Rebuild WAV with processed PCM (copy original header, replace data)
    const wavHeader = rawWav.slice(0, 44);
    const finalWav = Buffer.concat([wavHeader, processedPcm]);
    await writeFile(outPath, finalWav);

    const isSample = !isPro && requestedDur > 30;

    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", `attachment; filename="GKP_Beat_${key}_${genre}_${bpm}bpm.wav"`);
    res.setHeader("X-GK-Mode", "beatmaker");
    res.setHeader("X-GK-Kernel", "MLK_V3");
    res.setHeader("X-GK-Parity", stats.parity);
    res.setHeader("X-GK-Sample", isSample ? "true" : "false");
    res.setHeader("X-GK-Duration", String(duration));
    res.send(finalWav);

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message ?? "Beat generation failed." });
  } finally {
    await Promise.all([
      unlink(rawPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
      unlink(pcmPath).catch(() => {}),
    ]);
  }
});

export default beatRouter;
