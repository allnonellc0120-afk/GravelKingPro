import { db, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Tier-aware rolling WAV export quota: Pro gets 10 per 7 days; King gets 40
 * per 30 days. MP3 exports are unlimited for paid tiers.
 *
 * Applies to paid WAV exports. Pro MP3 exports are intentionally unlimited;
 * the master route does not call this module for MP3 requests.
 *
 * Bypasses: developer/owner accounts (isDeveloper) and partner-API requests
 * (callers never reach this module for those).
 */
export const PRO_EXPORT_LIMIT = 10;
export const PRO_EXPORT_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const KING_EXPORT_LIMIT = 40;
export const KING_EXPORT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
/** Legacy aliases retained for integrations importing the old constants. */
export const EXPORT_LIMIT = KING_EXPORT_LIMIT;
export const EXPORT_PERIOD_MS = KING_EXPORT_PERIOD_MS;

export interface ExportQuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  unlimited?: boolean;
  /** When the current 30-day window ends (null = window not started yet). */
  resetsAt: string | null;
}

function quotaFor(user: User) {
  if (user.isDeveloper || user.subscriptionTier === "node_auditor") return null;
  if (user.subscriptionTier === "king" || user.subscriptionTier === "monthly") {
    return { limit: KING_EXPORT_LIMIT, periodMs: KING_EXPORT_PERIOD_MS, interval: "30 days", label: "30 days" };
  }
  return { limit: PRO_EXPORT_LIMIT, periodMs: PRO_EXPORT_PERIOD_MS, interval: "7 days", label: "7 days" };
}

function windowExpired(user: User, now: Date, periodMs: number): boolean {
  return !user.exportPeriodStart ||
    now.getTime() - user.exportPeriodStart.getTime() >= periodMs;
}

/** Read-only check — never mutates counters. Call before expensive work. */
export function checkExportQuota(user: User, now = new Date()): ExportQuotaStatus {
  const policy = quotaFor(user);
  if (!policy) {
    return { allowed: true, used: 0, limit: 0, unlimited: true, resetsAt: null };
  }
  if (windowExpired(user, now, policy.periodMs)) {
    return { allowed: true, used: 0, limit: policy.limit, resetsAt: null };
  }
  const used = user.monthlyExports ?? 0;
  return {
    allowed: used < policy.limit,
    used,
    limit: policy.limit,
    resetsAt: new Date(user.exportPeriodStart!.getTime() + policy.periodMs).toISOString(),
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
  const policy = quotaFor(user);
  if (!policy) {
    return { allowed: true, used: 0, limit: 0, unlimited: true, resetsAt: null };
  }

  const expired = sql`(${usersTable.exportPeriodStart} IS NULL OR ${usersTable.exportPeriodStart} <= NOW() - INTERVAL '${sql.raw(policy.interval)}')`;

  const updated = await db
    .update(usersTable)
    .set({
      monthlyExports: sql`CASE WHEN ${expired} THEN 1 ELSE ${usersTable.monthlyExports} + 1 END`,
      exportPeriodStart: sql`CASE WHEN ${expired} THEN NOW() ELSE ${usersTable.exportPeriodStart} END`,
    })
    .where(sql`${usersTable.id} = ${user.id} AND (${expired} OR ${usersTable.monthlyExports} < ${policy.limit})`)
    .returning({
      monthlyExports: usersTable.monthlyExports,
      exportPeriodStart: usersTable.exportPeriodStart,
    });

  if (updated.length > 0) {
    const row = updated[0];
    return {
      allowed: true,
      used: row.monthlyExports,
      limit: policy.limit,
      resetsAt: row.exportPeriodStart
        ? new Date(row.exportPeriodStart.getTime() + policy.periodMs).toISOString()
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
    used: row?.monthlyExports ?? policy.limit,
    limit: policy.limit,
    resetsAt: row?.exportPeriodStart
      ? new Date(row.exportPeriodStart.getTime() + policy.periodMs).toISOString()
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
    error: `You've reached your WAV export limit (${q.limit} exports in this rolling window). ` +
      (q.resetsAt ? `Your quota resets on ${new Date(q.resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.` : "Try again later."),
  };
}
