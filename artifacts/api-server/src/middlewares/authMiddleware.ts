import { clerkClient, getAuth } from "@clerk/express";
import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import type { User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getSession, getSessionId, DEMO_USER_ID, DEMO_EMAIL } from "../lib/auth";

// ── Lifetime access grants ────────────────────────────────────────────────────
// Keyed by lower-cased verified email. Grant is re-applied on every login so
// it survives row re-use (e.g. email-adopted rows from a legacy signup).
const LIFETIME_GRANTS: Record<string, { tier: string; isDeveloper: boolean }> = {
  "allnonellc0120@gmail.com": { tier: "node_auditor", isDeveloper: true },
  "kymegky@gmail.com": { tier: "node_auditor", isDeveloper: false },
  "martypodany63@gmail.com": { tier: "node_auditor", isDeveloper: false },
  "marie.gilreath@gmail.com": { tier: "node_auditor", isDeveloper: false },
  "labordehope3@gmail.com": { tier: "node_auditor", isDeveloper: false },
  "hopelaborde66@gmail.com": { tier: "node_auditor", isDeveloper: false },
};

/** Permanently banned emails — auth rejected immediately. */
const BANNED_EMAILS = new Set<string>();

// ── Global Express type augmentation ─────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      dbUser?: User;
    }
  }
}

// ── JIT user provisioning ─────────────────────────────────────────────────────
/** Case-insensitive email row lookup (users.email is UNIQUE on the raw value). */
async function findUserByEmail(normalizedEmail: string): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalizedEmail}`)
    .limit(1);
  return row;
}

/**
 * Finds or creates a local users row for the given Clerk identity.
 * Bridge column: users.id === sessionClaims.userId (Replit Auth externalId for
 * migrated users; Clerk native ID for new sign-ups).
 *
 * Reconciliation order (mirrors the legacy OIDC upsertUser):
 *   1. Row keyed by the bridge id — use it.
 *   2. Row keyed by the same (case-insensitive) email — ADOPT it. Rows created
 *      by email-only grant-access or legacy sessions carry a UUID id that will
 *      never match the bridge id; `email` is UNIQUE, so inserting would throw.
 *      The adopted row keeps its id (FKs like process_runs reference users.id),
 *      and entitlement stays keyed off the returned row.
 *   3. Insert a fresh row keyed by the bridge id. Conflict-safe: on any unique
 *      violation (concurrent first request, or an email row created between the
 *      lookups), fall back to re-selecting by id then email.
 */
async function jitProvisionUser(userId: string, email: string | null): Promise<User | null> {
  const normalizedEmail = email?.toLowerCase().trim() || null;

  if (normalizedEmail && BANNED_EMAILS.has(normalizedEmail)) return null;

  const grant = normalizedEmail ? LIFETIME_GRANTS[normalizedEmail] : undefined;

  // 1) Bridge-id row
  let dbUser: User | undefined = (
    await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1)
  )[0];

  // 2) Email-row adoption
  if (!dbUser && normalizedEmail) {
    dbUser = await findUserByEmail(normalizedEmail);
  }

  // 3) Fresh insert (conflict-safe)
  if (!dbUser) {
    const [inserted] = await db
      .insert(usersTable)
      .values({
        id: userId,
        email: email,
        ...(grant
          ? { isPro: true, subscriptionTier: grant.tier, isDeveloper: grant.isDeveloper }
          : {}),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      dbUser = inserted;
    } else {
      // Unique violation swallowed by onConflictDoNothing: either a concurrent
      // request inserted the id row, or an email-unique row exists. Re-resolve.
      [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!dbUser && normalizedEmail) {
        dbUser = await findUserByEmail(normalizedEmail);
      }
    }
  }

  if (!dbUser) return null;

  // Apply (or refresh) lifetime grant on every request — keyed by the actual
  // row id (which may differ from the bridge id for adopted email rows).
  if (
    grant &&
    (!dbUser.isPro ||
      dbUser.subscriptionTier !== grant.tier ||
      dbUser.isDeveloper !== grant.isDeveloper)
  ) {
    const [updated] = await db
      .update(usersTable)
      .set({ isPro: true, subscriptionTier: grant.tier, isDeveloper: grant.isDeveloper })
      .where(eq(usersTable.id, dbUser.id))
      .returning();
    if (updated) dbUser = updated;
  }

  return dbUser;
}

async function resolveClerkEmail(userId: string, claimEmail: string | undefined): Promise<string | null> {
  const fromClaim = claimEmail?.toLowerCase().trim();
  if (fromClaim) return fromClaim;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    return clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase().trim() ?? null;
  } catch {
    // A valid Clerk session should still be allowed through if the profile
    // lookup is temporarily unavailable; the next request can backfill email.
    return null;
  }
}

/** Exported for integration tests only. */
export { jitProvisionUser as __jitProvisionUserForTest };

/**
 * Global optional auth middleware — runs after clerkMiddleware on every request.
 * Populates req.dbUser when:
 *   - A valid Clerk session exists (primary path), OR
 *   - A valid demo session cookie (sid) exists (demo reviewer path).
 * Never rejects — unauthenticated requests pass through with req.dbUser undefined.
 */
export async function loadAuthUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = getAuth(req);
    // sessionClaims.userId = original Replit Auth sub for migrated users;
    // Clerk native ID (user_2abc...) for new users — use as local DB bridge.
    const userId: string | null =
      (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
    if (userId) {
      const email = await resolveClerkEmail(
        userId,
        auth?.sessionClaims?.email as string | undefined,
      );

      const normalizedEmail = email?.toLowerCase().trim();
      if (normalizedEmail && BANNED_EMAILS.has(normalizedEmail)) {
        res.status(403).json({ error: "Account suspended." });
        return;
      }
       const dbUser = await jitProvisionUser(userId, email);
      if (dbUser) req.dbUser = dbUser;
    } else {
      // Fallback: server-side session (sid cookie or Bearer <sid> header).
      // Used by the Play reviewer demo account and by in-process test suites
      // that seed the sessions table directly.
      const sid = getSessionId(req);
      if (sid) {
        const session = await getSession(sid);
        const sessionUserId = session?.user?.id;
        if (sessionUserId) {
          let [sessionUser] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, sessionUserId))
            .limit(1);
          if (!sessionUser && sessionUserId === DEMO_USER_ID) {
            const [inserted] = await db
              .insert(usersTable)
              .values({
                id: DEMO_USER_ID,
                email: DEMO_EMAIL,
                isPro: true,
                subscriptionTier: "node_auditor",
              })
              .onConflictDoNothing()
              .returning();
            sessionUser =
              inserted ||
              (
                await db
                  .select()
                  .from(usersTable)
                  .where(eq(usersTable.id, DEMO_USER_ID))
                  .limit(1)
              )[0];
          }
          if (sessionUser) req.dbUser = sessionUser;
        }
      }
    }
  } catch {
    // Non-fatal: if auth resolution fails, continue unauthenticated
  }
  next();
}

/**
 * Route-level auth guard. Returns 401 if req.dbUser is not set.
 * Always mount AFTER loadAuthUser.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.dbUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
