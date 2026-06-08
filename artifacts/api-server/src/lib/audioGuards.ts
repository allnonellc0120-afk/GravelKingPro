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
