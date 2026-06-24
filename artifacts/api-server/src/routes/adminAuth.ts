import { Router, type Request, type Response } from "express";
import {
  setAdminCookie,
  clearAdminCookie,
  isAdminAuthenticated,
  isDeveloperAuthenticated,
  requireAdmin,
} from "../lib/adminAuth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

/** GET /api/admin/check — return 200 if admin session OR developer user is valid. */
adminAuthRouter.get("/admin/check", async (req: Request, res: Response) => {
  if (isAdminAuthenticated(req)) {
    res.json({ ok: true });
    return;
  }
  if (await isDeveloperAuthenticated(req)) {
    res.json({ ok: true });
    return;
  }
  res.status(401).json({ ok: false });
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
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!await requireAdmin(req, res)) return;

  const body = req.body as {
    id?: string;
    email?: string;
    firstName?: string;
    tier?: string;
    isDeveloper?: boolean;
  };

  const tier = body.tier?.trim();
  const email = body.email?.trim();
  const firstName = body.firstName?.trim() ?? null;
  const id = body.id?.trim();
  const isDeveloper = body.isDeveloper ?? false;

  if (!tier || !["node_auditor", "monthly", "weekly"].includes(tier)) {
    res.status(400).json({ error: "tier must be node_auditor, monthly, or weekly" });
    return;
  }
  if (!email && !id) {
    res.status(400).json({ error: "email or id required" });
    return;
  }

  try {
    const returning = {
      id: usersTable.id,
      email: usersTable.email,
      subscriptionTier: usersTable.subscriptionTier,
      isPro: usersTable.isPro,
      isDeveloper: usersTable.isDeveloper,
    } as const;

    // Prefer updating an existing row (by id, then by email) over inserting.
    let existingId: string | null = null;
    if (id) {
      const [r] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id));
      existingId = r?.id ?? null;
    }
    if (!existingId && email) {
      const [r] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
      existingId = r?.id ?? null;
    }

    if (existingId) {
      const updates: Record<string, unknown> = { isPro: true, subscriptionTier: tier, isDeveloper };
      if (email) updates.email = email;
      if (firstName) updates.firstName = firstName;
      const [row] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, existingId))
        .returning(returning);
      res.json({ ok: true, user: row, action: "updated" });
      return;
    }

    // No existing row — insert fresh.
    const [row] = await db
      .insert(usersTable)
      .values({
        ...(id ? { id } : {}),
        email: email ?? null,
        firstName: firstName ?? null,
        isPro: true,
        subscriptionTier: tier,
        isDeveloper,
      })
      .returning(returning);

    res.json({ ok: true, user: row, action: "inserted" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default adminAuthRouter;
