import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const router = Router();

/**
 * GET /api/activate?t=<grant_row_uuid>
 *
 * Lifetime-access claim link. The token is the UUID of a pre-registered user
 * row that has is_pro=true. Steps:
 *  1. Validate the token and confirm the row is a legitimate lifetime grant.
 *  2. Find the current browser session's user (gk_session cookie).
 *  3. Upgrade that user's row to the granted tier + reset free-tier counters.
 *     If no session exists yet, stamp the grant row with a fresh session.
 *  4. Set the gk_session cookie and redirect to /?activated=1.
 *
 * Security: token is a 128-bit random UUID — unguessable. The endpoint
 * validates is_pro=true server-side so a random UUID can never claim access.
 */
router.get("/activate", async (req: Request, res: Response) => {
  const token = (req.query.t as string | undefined)?.trim();

  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    res.redirect("/?activated=invalid");
    return;
  }

  const [grantRow] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, token));

  if (!grantRow || !grantRow.isPro || !grantRow.subscriptionTier) {
    res.redirect("/?activated=invalid");
    return;
  }

  const tier = grantRow.subscriptionTier;
  const cookieSessionId = (req.cookies as Record<string, string>)?.gk_session;

  const cookieAge = { httpOnly: true, sameSite: "lax" as const, maxAge: 365 * 24 * 60 * 60 * 1000, path: "/" };

  if (cookieSessionId) {
    const [sessionUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.sessionId, cookieSessionId));

    if (sessionUser && sessionUser.id !== grantRow.id) {
      // Upgrade the session-owning row to the granted tier.
      await db
        .update(usersTable)
        .set({
          isPro: true,
          subscriptionTier: tier,
          email: grantRow.email ?? sessionUser.email,
          firstName: grantRow.firstName ?? sessionUser.firstName,
          freeVoiceRemovals: 0,
          freeStemSplits: 0,
          freeMasterDownloads: 0,
        })
        .where(eq(usersTable.id, sessionUser.id));

      res.cookie("gk_session", cookieSessionId, cookieAge);
      res.redirect("/?activated=1");
      return;
    }
  }

  // No usable session — stamp the grant row with a new session ID.
  const newSession = randomUUID();
  await db
    .update(usersTable)
    .set({
      sessionId: newSession,
      freeVoiceRemovals: 0,
      freeStemSplits: 0,
      freeMasterDownloads: 0,
    })
    .where(eq(usersTable.id, grantRow.id));

  res.cookie("gk_session", newSession, cookieAge);
  res.redirect("/?activated=1");
});

export default router;
