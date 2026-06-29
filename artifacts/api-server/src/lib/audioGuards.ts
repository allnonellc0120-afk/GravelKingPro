import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

export const MAX_AUDIO_DURATION_S = 900;

export function sanitizeExt(originalname: string): string {
  return (originalname.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function probeAudioDuration(inputBuf: Buffer, ext: string): Promise<number> {
  const path = `/tmp/gk_dur_${randomUUID()}.${ext}`;
  await writeFile(path, inputBuf);
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", path],
      { timeout: 10_000 },
    );
    const info = JSON.parse(stdout);
    return parseFloat(info.format?.duration ?? "0") || 0;
  } catch {
    return 0;
  } finally {
    await unlink(path).catch(() => {});
  }
}

export async function probeFileDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
      { timeout: 10_000 },
    );
    const info = JSON.parse(stdout);
    return parseFloat(info.format?.duration ?? "0") || 0;
  } catch {
    return 0;
  }
}

/**
 * Any format (MP3, M4A, AAC, OGG, OPUS, MP4, MOV, WebM…) → 44.1 kHz stereo
 * pcm_s16le WAV on disk.  Returns the new WAV path; the caller is responsible
 * for unlinking it.  Throws if ffmpeg cannot decode the input (e.g. corrupt
 * file), with a user-readable message so the route can forward it to the client.
 *
 * Audio-only formats pass through just as fast as a copy; video containers
 * are stripped with -vn so only the audio stream is extracted.
 */
export async function normalizeToWav(inputPath: string): Promise<string> {
  const outPath = `/tmp/gk_norm_${randomUUID()}.wav`;
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath, "-vn",
      "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
      outPath,
    ], { timeout: 120_000 });
  } catch {
    throw new Error(
      "Could not decode audio from this file. Try a different format (MP3 or WAV work best)."
    );
  }
  return outPath;
}
