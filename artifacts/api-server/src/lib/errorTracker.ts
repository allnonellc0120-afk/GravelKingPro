import { db, toolErrorsTable } from "@workspace/db";

/**
 * Structured error tracker for pinpoint diagnostics. Writes a row per failure
 * so the Admin Diagnostics panel can show Timestamp / Tool / Stage / Raw Error.
 * Never throws — a logging failure must never mask or replace the real error.
 */
export async function logToolError(toolName: string, stage: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(toolErrorsTable).values({ toolName, stage, message });
  } catch {
    // Best-effort only. Swallow so a DB hiccup never breaks the caller's own error handling.
  }
}
