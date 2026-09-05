import { db, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * King subscribers have unlimited included certificate unlocks. Pro and Free
 * subscribers get no included allowance, but may always buy an individual
 * permanent unlock for $1.99. Node Auditor and developer accounts are
 * supersets of King.
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
  if (user.isDeveloper || user.subscriptionTier === "king" || user.subscriptionTier === "monthly" || user.subscriptionTier === "node_auditor") {
    // `limit: 0` is retained for the historic numeric response shape; callers
    // should treat allowed + resetsAt:null as an unlimited included benefit.
    return { allowed: true, used: 0, limit: 0, resetsAt: null };
  }
  return { allowed: false, used: 0, limit: 0, resetsAt: null };
}

/**
 * Consume one included unlock in a single database-atomic statement.
 * NOTE: the `INTERVAL '30 days'` literal must stay in sync with
 * CERT_UNLOCK_PERIOD_MS above.
 */
export async function consumeCertUnlock(user: User): Promise<CertUnlockQuotaStatus> {
  if (user.isDeveloper || user.subscriptionTier === "king" || user.subscriptionTier === "monthly" || user.subscriptionTier === "node_auditor") {
    return { allowed: true, used: 0, limit: 0, resetsAt: null };
  }
  return { allowed: false, used: 0, limit: 0, resetsAt: null };
}
