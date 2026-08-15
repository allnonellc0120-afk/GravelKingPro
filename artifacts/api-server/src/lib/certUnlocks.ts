import { db, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Included certificate-unlock allowance — monthly (Studio) and node_auditor
 * subscribers get 20 included certificate unlocks per rolling 30-day window.
 * Weekly and free users get NO included unlocks: they pay $1.99 per
 * certificate (one-time, permanent) via Stripe Checkout instead.
 *
 * The consume path mirrors lib/exportQuota.ts: reset-or-increment decided
 * against the CURRENT row inside ONE UPDATE so concurrent unlocks at a
 * window boundary can never each "reset to 1" or blow past the cap.
 */
export const CERT_UNLOCK_LIMIT = 20;
export const CERT_UNLOCK_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export interface CertUnlockQuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  resetsAt: string | null;
}

function windowExpired(user: User, now: Date): boolean {
  return !user.certUnlockPeriodStart ||
    now.getTime() - user.certUnlockPeriodStart.getTime() >= CERT_UNLOCK_PERIOD_MS;
}

/** Read-only check — never mutates counters. */
export function checkCertUnlockQuota(user: User, now = new Date()): CertUnlockQuotaStatus {
  if (user.isDeveloper) {
    return { allowed: true, used: 0, limit: CERT_UNLOCK_LIMIT, resetsAt: null };
  }
  if (windowExpired(user, now)) {
    return { allowed: true, used: 0, limit: CERT_UNLOCK_LIMIT, resetsAt: null };
  }
  const used = user.certUnlocks ?? 0;
  return {
    allowed: used < CERT_UNLOCK_LIMIT,
    used,
    limit: CERT_UNLOCK_LIMIT,
    resetsAt: new Date(user.certUnlockPeriodStart!.getTime() + CERT_UNLOCK_PERIOD_MS).toISOString(),
  };
}

/**
 * Consume one included unlock in a single database-atomic statement.
 * NOTE: the `INTERVAL '30 days'` literal must stay in sync with
 * CERT_UNLOCK_PERIOD_MS above.
 */
export async function consumeCertUnlock(user: User): Promise<CertUnlockQuotaStatus> {
  if (user.isDeveloper) {
    return { allowed: true, used: 0, limit: CERT_UNLOCK_LIMIT, resetsAt: null };
  }

  const expired = sql`(${usersTable.certUnlockPeriodStart} IS NULL OR ${usersTable.certUnlockPeriodStart} <= NOW() - INTERVAL '30 days')`;

  const updated = await db
    .update(usersTable)
    .set({
      certUnlocks: sql`CASE WHEN ${expired} THEN 1 ELSE ${usersTable.certUnlocks} + 1 END`,
      certUnlockPeriodStart: sql`CASE WHEN ${expired} THEN NOW() ELSE ${usersTable.certUnlockPeriodStart} END`,
    })
    .where(sql`${usersTable.id} = ${user.id} AND (${expired} OR ${usersTable.certUnlocks} < ${CERT_UNLOCK_LIMIT})`)
    .returning({
      certUnlocks: usersTable.certUnlocks,
      certUnlockPeriodStart: usersTable.certUnlockPeriodStart,
    });

  if (updated.length > 0) {
    const row = updated[0];
    return {
      allowed: true,
      used: row.certUnlocks,
      limit: CERT_UNLOCK_LIMIT,
      resetsAt: row.certUnlockPeriodStart
        ? new Date(row.certUnlockPeriodStart.getTime() + CERT_UNLOCK_PERIOD_MS).toISOString()
        : null,
    };
  }

  // Denied — read the current row so used/resetsAt are accurate, not stale.
  const [row] = await db
    .select({
      certUnlocks: usersTable.certUnlocks,
      certUnlockPeriodStart: usersTable.certUnlockPeriodStart,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.id));
  return {
    allowed: false,
    used: row?.certUnlocks ?? CERT_UNLOCK_LIMIT,
    limit: CERT_UNLOCK_LIMIT,
    resetsAt: row?.certUnlockPeriodStart
      ? new Date(row.certUnlockPeriodStart.getTime() + CERT_UNLOCK_PERIOD_MS).toISOString()
      : null,
  };
}
