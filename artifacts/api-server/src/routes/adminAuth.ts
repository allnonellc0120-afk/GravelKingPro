import { Router, type Request, type Response } from "express";
import {
  setAdminCookie,
  clearAdminCookie,
  isAdminAuthenticated,
  requireAdmin,
} from "../lib/adminAuth";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const adminAuthRouter = Router();

/** POST /api/admin/login — verify key, set httpOnly session cookie. */
adminAuthRouter.post("/admin/login", (req: Request, res: Response) => {
  const adminKey = process.env.ADMIN_KEY?.trim() ?? "";
  if (!adminKey) {
    res.status(503).json({ error: "Admin key not configured on the server." });
    return;
  }

  const { key } = (req.body ?? {}) as { key?: string };
  if (!key?.trim() || key.trim() !== adminKey) {
    res.status(403).json({ error: "Invalid admin key." });
    return;
  }

  setAdminCookie(res, adminKey);
  res.json({ ok: true });
});

/** GET /api/admin/check — return 200 if session is valid, 401 otherwise. */
adminAuthRouter.get("/admin/check", (req: Request, res: Response) => {
  if (isAdminAuthenticated(req)) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

/** POST /api/admin/logout — clear the session cookie. */
adminAuthRouter.post("/admin/logout", (_req: Request, res: Response) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

/**
 * POST /api/admin/grant-access
 * Upsert a user row with lifetime access in whatever DB the server is connected to.
 * Body: { id?: string, email: string, firstName?: string, tier: "node_auditor" | "monthly" | "weekly" }
 * Uses ON CONFLICT to update if a row with the given id already exists.
 */
adminAuthRouter.post("/admin/grant-access", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const body = req.body as {
    id?: string;
    email?: string;
    firstName?: string;
    tier?: string;
  };

  const tier = body.tier?.trim();
  const email = body.email?.trim();
  const firstName = body.firstName?.trim() ?? null;
  const id = body.id?.trim();

  if (!tier || !["node_auditor", "monthly", "weekly"].includes(tier)) {
    res.status(400).json({ error: "tier must be node_auditor, monthly, or weekly" });
    return;
  }
  if (!email && !id) {
    res.status(400).json({ error: "email or id required" });
    return;
  }

  try {
    const rowId = id ?? undefined;
    const [row] = await db
      .insert(usersTable)
      .values({
        ...(rowId ? { id: rowId } : {}),
        email: email ?? null,
        firstName,
        isPro: true,
        subscriptionTier: tier,
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          isPro: true,
          subscriptionTier: tier,
          email: email ? sql`excluded.email` : sql`users.email`,
          firstName: firstName ? sql`excluded.first_name` : sql`users.first_name`,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        subscriptionTier: usersTable.subscriptionTier,
        isPro: usersTable.isPro,
      });

    res.json({ ok: true, user: row });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default adminAuthRouter;
