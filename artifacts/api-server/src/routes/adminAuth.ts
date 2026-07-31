import { Router, type Request, type Response } from "express";
import {
  setAdminCookie,
  clearAdminCookie,
  isAdminAuthenticated,
  isDeveloperAuthenticated,
  requireAdmin,
} from "../lib/adminAuth";
import { db, usersTable, tracksTable, toolErrorsTable } from "@workspace/db";
import { eq, inArray, desc } from "drizzle-orm";
import { setMaintenanceMode, isMaintenanceModeOn } from "../middlewares/maintenanceMode";
import { getActiveSessions } from "../lib/activityTracker";
import { purgeTempAudioCache } from "../lib/cachePurge";
import { submitSitemapToGSC } from "../lib/gsc-api";
import { submitSitemapToBing } from "../lib/bingWebmaster";
import { rateLimit } from "../lib/rateLimiter";

const adminAuthRouter = Router();

// Brute-force protection — the admin key is short by design (owner's personal
// code), so failed attempts must be expensive: 5 tries per 15 min per IP.
const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  message: "Too many login attempts. Wait 15 minutes and try again.",
});

/** POST /api/admin/login — verify key, set httpOnly session cookie. */
adminAuthRouter.post("/admin/login", adminLoginRateLimit, (req: Request, res: Response) => {
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

/**
 * POST /api/admin/purge-user
 * Hard-delete a user and all their associated data (tracks, process_runs, purchased_tracks).
 * Body: { email: string }
 */
adminAuthRouter.post("/admin/purge-user", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;

  const { email } = (req.body ?? {}) as { email?: string };
  const normalised = email?.toLowerCase().trim();
  if (!normalised) {
    res.status(400).json({ error: "email required" });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, normalised));

    if (!user) {
      res.json({ ok: true, deleted: false, message: "No user found with that email." });
      return;
    }

    const userId = user.id;

    // Find tracks submitted by or owned by this user
    const ownedTracks = await db
      .select({ id: tracksTable.id })
      .from(tracksTable)
      .where(eq(tracksTable.submittedByUserId, userId));
    const ownedIds = ownedTracks.map((t) => t.id);

    // Delete in FK-safe order
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM process_runs WHERE user_id = ${userId}`);

    if (ownedIds.length > 0) {
      await db.delete(tracksTable).where(inArray(tracksTable.id, ownedIds));
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));

    res.json({
      ok: true,
      deleted: true,
      userId,
      email: user.email,
      tracksRemoved: ownedIds.length,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/**
 * GET /api/admin/tool-errors
 * Recent structured error log entries (Timestamp, Tool, Stage, Raw Message) for
 * the Admin Diagnostics panel. Newest first, capped at 100 rows.
 */
adminAuthRouter.get("/admin/tool-errors", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(toolErrorsTable)
      .orderBy(desc(toolErrorsTable.createdAt))
      .limit(100);
    res.json({ ok: true, errors: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/**
 * GET /api/admin/integrity-check
 * Lightweight real-time status of the Google Cloud Run / Vertex AI routing path,
 * so an admin can audit connectivity instantly without digging through logs.
 */
adminAuthRouter.get("/admin/integrity-check", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;

  const gcpConfigured = Boolean(process.env.GCP_SERVICE_ACCOUNT?.trim());
  const demucsUrl = process.env.DEMUCS_URL?.trim() ?? "";
  let demucsReachable: boolean | null = null;

  if (demucsUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const r = await fetch(demucsUrl, { method: "GET", signal: controller.signal }).catch(() => null);
      clearTimeout(timeout);
      demucsReachable = r != null;
    } catch {
      demucsReachable = false;
    }
  }

  res.json({
    ok: true,
    gcpServiceAccountConfigured: gcpConfigured,
    demucsUrlConfigured: Boolean(demucsUrl),
    demucsReachable,
    checkedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/maintenance — current kill switch state.
 * POST /api/admin/maintenance — body { on: boolean }, toggles it.
 */
adminAuthRouter.get("/admin/maintenance", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  res.json({ ok: true, on: await isMaintenanceModeOn() });
});

adminAuthRouter.post("/admin/maintenance", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const { on } = (req.body ?? {}) as { on?: boolean };
  if (typeof on !== "boolean") {
    res.status(400).json({ error: "on (boolean) required" });
    return;
  }
  try {
    await setMaintenanceMode(on);
    res.json({ ok: true, on });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/**
 * GET /api/admin/activity
 * Live Activity Monitor — sessions active within the last 5 minutes and which
 * tool they last touched. In-memory snapshot, not persisted.
 */
adminAuthRouter.get("/admin/activity", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  res.json({ ok: true, sessions: getActiveSessions() });
});

/**
 * POST /api/admin/cache-purge
 * Deletes this app's own /tmp scratch audio files. Never touches the database.
 */
adminAuthRouter.post("/admin/cache-purge", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const result = await purgeTempAudioCache();
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/**
 * POST /api/admin/gsc-submit
 * Adds the site to Google Search Console and submits the sitemap using the
 * GCP_SERVICE_ACCOUNT credential. Returns instructions if the service account
 * needs to be granted GSC access first.
 */
adminAuthRouter.post("/admin/gsc-submit", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const result = await submitSitemapToGSC();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err: unknown) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail: "",
      sitesListed: [],
    });
  }
});

/**
 * POST /api/admin/bing-submit
 * Adds the site to Bing Webmaster Tools and submits the sitemap using the
 * BING_API_KEY secret. Returns a clear error message when the key is missing
 * or invalid.
 */
adminAuthRouter.post("/admin/bing-submit", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const result = await submitSitemapToBing();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err: unknown) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      siteAdded: false,
      sitemapSubmitted: false,
    });
  }
});

export default adminAuthRouter;
