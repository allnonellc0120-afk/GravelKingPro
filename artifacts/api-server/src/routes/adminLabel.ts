import { Router } from "express";
import type { Request, Response } from "express";
import { db, tracksTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

async function guard(req: Request, res: Response): Promise<boolean> {
  const { requireAdmin } = await import("../lib/adminAuth");
  return requireAdmin(req, res);
}

/** Build a unified list of all label tracks with submitter subscription info. */
async function fetchAllLabelTracks() {
  const rows = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      artistName: tracksTable.artistName,
      status: tracksTable.status,
      price: tracksTable.price,
      adminOverride: tracksTable.adminOverride,
      overrideExpiresAt: tracksTable.overrideExpiresAt,
      takenDown: tracksTable.takenDown,
      submittedByUserId: tracksTable.submittedByUserId,
      createdAt: tracksTable.createdAt,
      updatedAt: tracksTable.updatedAt,
      submitterIsPro: usersTable.isPro,
      submitterTier: usersTable.subscriptionTier,
    })
    .from(tracksTable)
    .leftJoin(usersTable, eq(tracksTable.submittedByUserId, usersTable.id))
    .orderBy(desc(tracksTable.createdAt));

  const now = new Date();
  const autoTakedownIds: string[] = [];

  const enriched = rows.map((r) => {
    const overrideActive =
      r.adminOverride &&
      r.overrideExpiresAt != null &&
      new Date(r.overrideExpiresAt) > now;

    const subscriberCurrent = r.submitterIsPro === true;

    const labelEligible = subscriberCurrent || overrideActive;

    if (
      r.status === "accepted" &&
      !r.takenDown &&
      !labelEligible &&
      r.submittedByUserId !== null
    ) {
      autoTakedownIds.push(r.id);
    }

    return {
      ...r,
      overrideActive,
      subscriberCurrent,
      labelEligible,
    };
  });

  if (autoTakedownIds.length > 0) {
    await db
      .update(tracksTable)
      .set({ takenDown: true, updatedAt: now })
      .where(
        eq(tracksTable.id, autoTakedownIds[0])
      );
    for (const id of autoTakedownIds) {
      await db
        .update(tracksTable)
        .set({ takenDown: true, updatedAt: now })
        .where(eq(tracksTable.id, id));
    }
  }

  return enriched.map((r) => ({
    ...r,
    takenDown: autoTakedownIds.includes(r.id) ? true : r.takenDown,
  }));
}

// GET /api/admin/label/tracks
router.get("/api/admin/label/tracks", async (req: Request, res: Response) => {
  if (!await guard(req, res)) return;
  try {
    const tracks = await fetchAllLabelTracks();
    res.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/admin/label/tracks/:id/approve
router.patch("/api/admin/label/tracks/:id/approve", async (req: Request, res: Response) => {
  if (!await guard(req, res)) return;
  try {
    const id = String(req.params["id"]);
    await db
      .update(tracksTable)
      .set({ status: "accepted", takenDown: false, updatedAt: new Date() })
      .where(eq(tracksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/admin/label/tracks/:id/reject
router.patch("/api/admin/label/tracks/:id/reject", async (req: Request, res: Response) => {
  if (!await guard(req, res)) return;
  try {
    const id = String(req.params["id"]);
    await db
      .update(tracksTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(tracksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/admin/label/tracks/:id/takedown
router.patch("/api/admin/label/tracks/:id/takedown", async (req: Request, res: Response) => {
  if (!await guard(req, res)) return;
  try {
    const id = String(req.params["id"]);
    await db
      .update(tracksTable)
      .set({ takenDown: true, updatedAt: new Date() })
      .where(eq(tracksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/admin/label/tracks/:id/restore
router.patch("/api/admin/label/tracks/:id/restore", async (req: Request, res: Response) => {
  if (!await guard(req, res)) return;
  try {
    const id = String(req.params["id"]);
    await db
      .update(tracksTable)
      .set({ status: "accepted", takenDown: false, updatedAt: new Date() })
      .where(eq(tracksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/admin/label/tracks/:id/override  { months: number }
router.patch("/api/admin/label/tracks/:id/override", async (req: Request, res: Response) => {
  if (!await guard(req, res)) return;
  try {
    const id = String(req.params["id"]);
    const months = Number((req.body as { months?: unknown }).months ?? 6);
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      res.status(400).json({ error: "months must be 1–24" });
      return;
    }
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);
    await db
      .update(tracksTable)
      .set({
        status: "accepted",
        takenDown: false,
        adminOverride: true,
        overrideExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(tracksTable.id, id));
    res.json({ ok: true, overrideExpiresAt: expiresAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
