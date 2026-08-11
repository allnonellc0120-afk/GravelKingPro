import type { Request, Response } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storage } from "../storage";

/**
 * Server-enforced free-use limits for the free tier.
 * Paid tiers (weekly/monthly/node_auditor) are never gated by these counters.
 */
export const FREE_LIMITS = {
  freeVoiceRemovals: 1,
  freeStemSplits: 0,
  freeMasterDownloads: 0,   // full masters are paid-only; free users get previews
  freeMasterPreviews: 1,    // 1 free 30-sec preview after the full master is used
  totalDownloads: 1,
} as const;

export type UsageField = keyof typeof FREE_LIMITS;

const COLUMN = {
  freeVoiceRemovals: usersTable.freeVoiceRemovals,
  freeStemSplits: usersTable.freeStemSplits,
  freeMasterDownloads: usersTable.freeMasterDownloads,
  freeMasterPreviews: usersTable.freeMasterPreviews,
  totalDownloads: usersTable.totalDownloads,
} as const;

/**
 * Resolve (or create) the user row used for free-usage accounting.
 * Authenticated users are tracked by their OIDC id; anonymous users by a
 * `gk_session` cookie (created here if absent) so free limits survive reloads.
 */
export async function getUsageUser(req: Request, res: Response): Promise<User> {
  if (req.dbUser) {
    return req.dbUser;
  }

  let sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (!sessionId) {
    sessionId = randomUUID();
    res.cookie("gk_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
  return storage.getOrCreateUser(sessionId);
}

/** Atomically increment a free-use counter for a user. */
export async function incrementUsage(userId: string, field: UsageField): Promise<void> {
  await db
    .update(usersTable)
    .set({ [field]: sql`${COLUMN[field]} + 1` })
    .where(eq(usersTable.id, userId));
}
