import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { storage } from "../storage";

const PRO_TIERS = new Set(["pro", "node_auditor"]);

/**
 * Returns true if the caller holds an active paid subscription.
 * Checks both auth paths:
 *   1. OIDC-authenticated user — fresh DB row to avoid stale session data.
 *   2. Anonymous gk_session cookie — Stripe subscription lookup via storage.
 */
export async function hasPaidSubscription(req: Request): Promise<boolean> {
  if (req.isAuthenticated()) {
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    if (dbUser?.subscriptionTier && PRO_TIERS.has(dbUser.subscriptionTier)) {
      return true;
    }
  }

  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (sessionId) {
    const user = await storage.getUserBySession(sessionId);
    if (user) {
      const status = await storage.getUserSubscriptionStatus(user);
      if (status.isPro) return true;
    }
  }

  return false;
}
