import { Router, Request, Response } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { gravelking_opt, verifyParity } from "../kernel";

const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const audioRouter = Router();

async function decodeToFloat32(inputBuf: Buffer, ext: string): Promise<{ samples: Float32Array; sampleRate: number; channels: number }> {
  const id = randomUUID();
  const inPath = `/tmp/gk_in_${id}.${ext}`;
  const outPath = `/tmp/gk_pcm_${id}.raw`;

  await writeFile(inPath, inputBuf);

  // Probe sample rate and channels
  let sampleRate = 44100;
  let channels = 1;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_streams", inPath,
    ]);
    const info = JSON.parse(stdout);
    const stream = info.streams?.find((s: any) => s.codec_type === "audio");
    if (stream) {
      sampleRate = parseInt(stream.sample_rate) || 44100;
      channels = parseInt(stream.channels) || 1;
    }
  } catch { /* use defaults */ }

  // Decode to raw float32 little-endian PCM, mix down to mono for kernel
  await execFileAsync("ffmpeg", [
    "-y", "-i", inPath,
    "-f", "f32le",
    "-ac", "1",
    "-ar", String(sampleRate),
    "-acodec", "pcm_f32le",
    outPath,
  ]);

  const rawBuf = await readFile(outPath);
  const samples = new Float32Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength / 4);

  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});

  return { samples: new Float32Array(samples), sampleRate, channels };
}

async function encodeToWav(samples: Float32Array, sampleRate: number): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/gk_processed_${id}.raw`;
  const outPath = `/tmp/gk_out_${id}.wav`;

  const rawBuf = Buffer.from(samples.buffer);
  await writeFile(inPath, rawBuf);

  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "f32le",
    "-ar", String(sampleRate),
    "-ac", "1",
    "-i", inPath,
    "-acodec", "pcm_s16le",
    outPath,
  ]);

  const wavBuf = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return wavBuf;
}

audioRouter.post(
  "/kernel/process-audio",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No audio file uploaded." });
      return;
    }

    try {
      const multiplier = parseFloat((req.body.multiplier as string) ?? "0.75");
      const sliceSize = parseInt((req.body.slice_size as string) ?? "2");
      const ext = (req.file.originalname.split(".").pop() ?? "mp3").toLowerCase();

      // Decode audio to float32 PCM on the server
      const { samples, sampleRate } = await decodeToFloat32(req.file.buffer, ext);

      // Run the GravelKing kernel server-side — algorithm stays private
      const result = gravelking_opt(Array.from(samples), multiplier, sliceSize);
      const parityStatus = verifyParity(result.processed);

      // Encode processed samples back to WAV
      const wavBuffer = await encodeToWav(new Float32Array(result.processed), sampleRate);

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="gravelking_processed.wav"`);
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
