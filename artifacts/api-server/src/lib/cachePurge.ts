import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const TMP_DIR = "/tmp";
// Only ever touches this app's own temp file naming convention — never a bare wildcard.
const GK_PREFIXES = ["gk_", "gkp_"];

/**
 * Deletes this app's own temp audio/session scratch files from /tmp.
 * Never touches the database. Safe to run at any time — every file matched
 * here is a disposable intermediate ffmpeg/processing artifact.
 */
export async function purgeTempAudioCache(): Promise<{
  filesDeleted: number;
  bytesFreed: number;
  errors: string[];
}> {
  let filesDeleted = 0;
  let bytesFreed = 0;
  const errors: string[] = [];

  let entries: string[] = [];
  try {
    entries = await readdir(TMP_DIR);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { filesDeleted, bytesFreed, errors };
  }

  for (const name of entries) {
    if (!GK_PREFIXES.some((p) => name.startsWith(p))) continue;
    const fullPath = path.join(TMP_DIR, name);
    try {
      const s = await stat(fullPath);
      if (!s.isFile()) continue;
      bytesFreed += s.size;
      await unlink(fullPath);
      filesDeleted++;
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { filesDeleted, bytesFreed, errors };
}
