import { db, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Rolling 30-day WAV export quota.
 *
 * Applies to paid WAV exports. Pro MP3 exports are intentionally unlimited;
 * the master route does not call this module for MP3 requests.
 *
 * Bypasses: developer/owner accounts (isDeveloper) and partner-API requests
 * (callers never reach this module for those).
 */
export const EXPORT_LIMIT = 20;
export const EXPORT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export interface ExportQuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  /** When the current 30-day window ends (null = window not started yet). */
  resetsAt: string | null;
}

function windowExpired(user: User, now: Date): boolean {
  return !user.exportPeriodStart ||
    now.getTime() - user.exportPeriodStart.getTime() >= EXPORT_PERIOD_MS;
}

/** Read-only check — never mutates counters. Call before expensive work. */
export function checkExportQuota(user: User, now = new Date()): ExportQuotaStatus {
  if (user.isDeveloper) {
    return { allowed: true, used: 0, limit: EXPORT_LIMIT, resetsAt: null };
  }
  if (windowExpired(user, now)) {
    return { allowed: true, used: 0, limit: EXPORT_LIMIT, resetsAt: null };
  }
  const used = user.monthlyExports ?? 0;
  return {
    allowed: used < EXPORT_LIMIT,
    used,
    limit: EXPORT_LIMIT,
    resetsAt: new Date(user.exportPeriodStart!.getTime() + EXPORT_PERIOD_MS).toISOString(),
  };
}

/**
 * Consume one export in a single database-atomic statement.
 *
 * The reset-or-increment decision is evaluated against the CURRENT row state
 * inside one UPDATE (never the possibly-stale in-memory user row), so
 * concurrent requests at a window boundary cannot each "reset to 1":
 * exactly one resets, the rest increment, and the cap predicate rejects
 * anything past the limit. Postgres row-level locking on the UPDATE
 * serializes concurrent consumers.
 *
 * NOTE: the `INTERVAL '30 days'` literal must stay in sync with
 * EXPORT_PERIOD_MS above.
 */
export async function consumeExport(user: User): Promise<ExportQuotaStatus> {
  if (user.isDeveloper) {
    return { allowed: true, used: 0, limit: EXPORT_LIMIT, resetsAt: null };
  }

  const expired = sql`(${usersTable.exportPeriodStart} IS NULL OR ${usersTable.exportPeriodStart} <= NOW() - INTERVAL '30 days')`;

  const updated = await db
    .update(usersTable)
    .set({
      monthlyExports: sql`CASE WHEN ${expired} THEN 1 ELSE ${usersTable.monthlyExports} + 1 END`,
      exportPeriodStart: sql`CASE WHEN ${expired} THEN NOW() ELSE ${usersTable.exportPeriodStart} END`,
    })
    .where(sql`${usersTable.id} = ${user.id} AND (${expired} OR ${usersTable.monthlyExports} < ${EXPORT_LIMIT})`)
    .returning({
      monthlyExports: usersTable.monthlyExports,
      exportPeriodStart: usersTable.exportPeriodStart,
    });

  if (updated.length > 0) {
    const row = updated[0];
    return {
      allowed: true,
      used: row.monthlyExports,
      limit: EXPORT_LIMIT,
      resetsAt: row.exportPeriodStart
        ? new Date(row.exportPeriodStart.getTime() + EXPORT_PERIOD_MS).toISOString()
        : null,
    };
  }

  // Denied — read the current row so used/resetsAt are accurate, not stale.
  const [row] = await db
    .select({
      monthlyExports: usersTable.monthlyExports,
      exportPeriodStart: usersTable.exportPeriodStart,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.id));
  return {
    allowed: false,
    used: row?.monthlyExports ?? EXPORT_LIMIT,
    limit: EXPORT_LIMIT,
    resetsAt: row?.exportPeriodStart
      ? new Date(row.exportPeriodStart.getTime() + EXPORT_PERIOD_MS).toISOString()
      : null,
  };
}

/** Standard 429 payload so every export surface reports the limit the same way. */
export function exportLimitPayload(q: ExportQuotaStatus) {
  return {
    success: false,
    code: "EXPORT_LIMIT_REACHED",
    limit: q.limit,
    used: q.used,
    resetsAt: q.resetsAt,
    error: `You've reached your WAV export limit (${q.limit} exports per 30 days). ` +
      (q.resetsAt ? `Your quota resets on ${new Date(q.resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.` : "Try again later."),
  };
}
