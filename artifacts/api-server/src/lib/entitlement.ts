import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { storage } from "../storage";

/**
 * Canonical subscription tiers.
 *   free          — no paid plan
 *   weekly        — $9.99/week: unlimited voice remover / stem split + preset masters (with denoise)
 *   monthly       — $29.99/month (Studio): everything in weekly PLUS Studio (adjustable mastering + live DAW)
 *   node_auditor  — $499/month enterprise tier (superset of everything)
 */
export type Tier = "free" | "weekly" | "monthly" | "node_auditor";

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  weekly: 1,
  monthly: 2,
  node_auditor: 3,
};

/** Normalize any stored/legacy tier string into a canonical Tier. */
export function normalizeTier(raw: string | null | undefined): Tier {
  switch (raw) {
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "node_auditor":
      return "node_auditor";
    // Legacy values from the previous pricing structure.
    case "splits":
      return "weekly";
    case "pro":
      return "monthly";
    default:
      return "free";
  }
}

/**
 * Resolve the effective tier for the caller, checking both auth paths:
 *   1. OIDC-authenticated user — fresh DB row to avoid stale session data.
 *   2. Anonymous gk_session cookie — Stripe subscription lookup via storage.
 * Returns the highest tier found across both paths.
 */
export async function resolveTier(req: Request): Promise<Tier> {
  let best: Tier = "free";

  if (req.isAuthenticated()) {
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    const t = normalizeTier(dbUser?.subscriptionTier);
    if (TIER_RANK[t] > TIER_RANK[best]) best = t;
  }

  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (sessionId) {
    const user = await storage.getUserBySession(sessionId);
    if (user) {
      const status = await storage.getUserSubscriptionStatus(user);
      const t = normalizeTier(status.tier);
      if (TIER_RANK[t] > TIER_RANK[best]) best = t;
    }
  }

  return best;
}

/** True if the caller holds any active paid subscription. */
export async function hasPaidSubscription(req: Request): Promise<boolean> {
  return (await resolveTier(req)) !== "free";
}

/** Weekly and above: unlimited voice removal, stem split, and preset masters. */
export async function hasUnlimitedSplits(req: Request): Promise<boolean> {
  return TIER_RANK[await resolveTier(req)] >= TIER_RANK.weekly;
}

/** Weekly and above: unlimited preset mastering full downloads. */
export async function hasUnlimitedMasters(req: Request): Promise<boolean> {
  return TIER_RANK[await resolveTier(req)] >= TIER_RANK.weekly;
}

/** Monthly (Studio) and above: adjustable mastering + live DAW. */
export async function hasStudio(req: Request): Promise<boolean> {
  return TIER_RANK[await resolveTier(req)] >= TIER_RANK.monthly;
}
