import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { storage } from "../storage";

/**
 * Canonical subscription tiers.
 *   free          — no paid plan
 *   pro           — $9.99/month: 800 credits per billing period and Pro tools
 *   king          — $24.99/month: 2,500 credits, advanced tools, and free certificates
 *   node_auditor  — $249.50/month enterprise tier (superset of everything)
 */
export type Tier = "free" | "pro" | "king" | "node_auditor";

/**
 * Lifetime-access emails. Any authenticated user whose verified OIDC email
 * matches an entry here immediately gets node_auditor tier — no Stripe check,
 * no DB tier column required. Must stay in sync with LIFETIME_GRANTS in auth.ts.
 */
const LIFETIME_EMAILS = new Set([
  "allnonellc0120@gmail.com",
  "ninastar1226@gmail.com",
  "kymegky@gmail.com",
  "martypodany63@gmail.com",
  "labordehope3@gmail.com",
  "hopelaborde66@gmail.com",
]);

/** Permanently banned emails — any authenticated user matching is forced to free tier. */
const BANNED_EMAILS = new Set<string>();

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  king: 2,
  node_auditor: 3,
};

/** Normalize any stored/legacy tier string into a canonical Tier. */
export function normalizeTier(raw: string | null | undefined): Tier {
  switch (raw) {
    case "pro":
    case "weekly": // Existing Weekly subscribers retain the lower paid tier.
    case "splits":
      return "pro";
    case "king":
    case "monthly": // Existing Studio subscribers retain their higher tier.
      return "king";
    case "node_auditor":
      return "node_auditor";
    // Legacy values from the previous pricing structure.
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

  if (req.dbUser) {
    const dbUser = req.dbUser;

    // Permanent ban enforcement — force free tier, ignore any stored tier.
    if (dbUser.email && BANNED_EMAILS.has(dbUser.email.toLowerCase().trim())) {
      return "free";
    }

    // Lifetime email bypass — no Stripe check needed, no stale DB tier.
    if (dbUser.email && LIFETIME_EMAILS.has(dbUser.email.toLowerCase().trim())) {
      return "node_auditor";
    }
    if (dbUser.isDeveloper) return "node_auditor";

    const t = normalizeTier(dbUser.subscriptionTier);
    if (TIER_RANK[t] > TIER_RANK[best]) best = t;
  }

  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (sessionId) {
    const user = await storage.getUserBySession(sessionId);
    if (user) {
      // Permanent ban enforcement for session-cookie path too.
      if (user.email && BANNED_EMAILS.has(user.email.toLowerCase().trim())) {
        return "free";
      }
      // Lifetime email bypass for session-cookie path too.
      if (user.email && LIFETIME_EMAILS.has(user.email.toLowerCase().trim())) {
        return "node_auditor";
      }
      if (user.isDeveloper) return "node_auditor";
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

/** Pro and above: unlimited voice removal, stem split, and preset masters. */
export async function hasUnlimitedSplits(req: Request): Promise<boolean> {
  return TIER_RANK[await resolveTier(req)] >= TIER_RANK.pro;
}

/** Pro and above: unlimited preset mastering full downloads. */
export async function hasUnlimitedMasters(req: Request): Promise<boolean> {
  return TIER_RANK[await resolveTier(req)] >= TIER_RANK.pro;
}

/** King and above: adjustable mastering + live DAW. */
export async function hasStudio(req: Request): Promise<boolean> {
  return TIER_RANK[await resolveTier(req)] >= TIER_RANK.king;
}
