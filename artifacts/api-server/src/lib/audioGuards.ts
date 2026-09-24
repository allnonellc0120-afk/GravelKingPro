import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

export const MAX_AUDIO_DURATION_S = 900;
export const AUDIO_PROCESS_TIMEOUT_MS = 45_000;

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
 * Any format (MP3, M4A, AAC, OGG, OPUS, MP4, MOV, WebM…) → 48 kHz stereo
 * 32-bit float PCM WAV on disk. Returns the new WAV path; the caller is responsible
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
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vn",
      "-map", "0:a:0",
      "-acodec", "pcm_f32le", "-ar", "48000", "-ac", "2",
      outPath,
    ], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: AUDIO_PROCESS_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
  } catch (err) {
    const processError = err as NodeJS.ErrnoException & {
      killed?: boolean;
      stderr?: string;
      stdout?: string;
    };
    const stderr = typeof processError.stderr === "string"
      ? processError.stderr.trim().replace(/\s+/g, " ")
      : "";
    const detail = stderr || (err instanceof Error ? err.message : String(err));
    console.warn(`[audio-ingest] ffmpeg decode failed: ${detail.slice(0, 600)}`);
    if (processError.code === "ETIMEDOUT" || processError.killed) {
      const timeoutError = new Error("FFmpeg audio conversion exceeded the 45-second execution limit.");
      timeoutError.name = "AudioProcessTimeoutError";
      throw timeoutError;
    }
    const decodeError = new Error(`FFmpeg could not demux this file: ${detail.slice(0, 900)}`);
    decodeError.name = "AudioDecodeError";
    throw decodeError;
  }
  return outPath;
}
