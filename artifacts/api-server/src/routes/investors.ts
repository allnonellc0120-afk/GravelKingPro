import { Router } from "express";
import type { Request, Response } from "express";
import { db, investorProspectsTable, investorTouchesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { runOverdueAlertCheck } from "../lib/investorAlerts";

const investorsRouter = Router();

async function guard(req: Request, res: Response): Promise<boolean> {
  const { requireAdmin } = await import("../lib/adminAuth");
  return requireAdmin(req, res);
}

// ── Seed data for the 12 known prospects ────────────────────────────────────
const SEED_PROSPECTS = [
  {
    sortOrder: 1,
    name: "SBG Partners",
    route: "Email: contact@sbg.vc (only verified email in playbook)",
    notes: "Lead with live product + billing. Send day 1.",
  },
  {
    sortOrder: 2,
    name: "Backbeat",
    route: "Official site contact / application form",
    notes: "Submit form day 1 alongside SBG email.",
  },
  {
    sortOrder: 3,
    name: "Mindset Ventures",
    route: "Official site contact form + LinkedIn partner outreach",
    notes:
      "MusicTech thesis. Pitch certification-as-infrastructure: the credit bureau of AI-era music.",
  },
  {
    sortOrder: 4,
    name: "Decile Access / Joker Deck Ventures",
    route: "Decile Group network application on official site; LinkedIn for the Joker Deck GP",
    notes:
      "Early-stage micro-checks. Lead with 'live in production, bootstrapped to billing' — that is their filter.",
  },
  {
    sortOrder: 5,
    name: "Amplify Music Ventures / Amplify.LA",
    route: "Application form on official site; warm intros via portfolio founders on LinkedIn",
    notes:
      "LA fund with music-tech portfolio. Pitch the wedge: free cert stamping grows the registry, $1.99 doc and $9.99 Studio convert.",
  },
  {
    sortOrder: 6,
    name: "Jukebox",
    route: "Official site contact / partnerships page",
    notes:
      "Music royalty investment platform. Chain-of-title is their core need — pitch certification as the diligence layer.",
  },
  {
    sortOrder: 7,
    name: "Prospect 7",
    route: "",
    notes: "Add from playbook page 3.",
  },
  {
    sortOrder: 8,
    name: "Prospect 8",
    route: "",
    notes: "Add from playbook page 3.",
  },
  {
    sortOrder: 9,
    name: "Prospect 9",
    route: "",
    notes: "Add from playbook page 3.",
  },
  {
    sortOrder: 10,
    name: "Prospect 10",
    route: "",
    notes: "Add from playbook page 3.",
  },
  {
    sortOrder: 11,
    name: "Prospect 11",
    route: "",
    notes: "Add from playbook page 3.",
  },
  {
    sortOrder: 12,
    name: "Prospect 12",
    route: "",
    notes: "Add from playbook page 3.",
  },
];

// ── GET /admin/investors ─────────────────────────────────────────────────────
// Returns all prospects with their touches, auto-seeding on first call.
investorsRouter.get("/admin/investors", async (req: Request, res: Response) => {
  if (!(await guard(req, res))) return;
  try {
    let prospects = await db
      .select()
      .from(investorProspectsTable)
      .orderBy(asc(investorProspectsTable.sortOrder));

    // Auto-seed on first ever load. onConflictDoNothing makes this safe
    // under concurrent requests — duplicate seed attempts are silently dropped.
    if (prospects.length === 0) {
      await db
        .insert(investorProspectsTable)
        .values(SEED_PROSPECTS)
        .onConflictDoNothing();
      prospects = await db
        .select()
        .from(investorProspectsTable)
        .orderBy(asc(investorProspectsTable.sortOrder));
    }

    const touches = await db
      .select()
      .from(investorTouchesTable)
      .orderBy(asc(investorTouchesTable.touchNumber));

    // Group touches by prospectId
    const touchesByProspect: Record<string, typeof touches> = {};
    for (const t of touches) {
      if (!touchesByProspect[t.prospectId]) touchesByProspect[t.prospectId] = [];
      touchesByProspect[t.prospectId].push(t);
    }

    const result = prospects.map((p) => ({
      ...p,
      touches: (touchesByProspect[p.id] ?? []).sort((a, b) => a.touchNumber - b.touchNumber),
    }));

    res.json({ prospects: result });
  } catch (err) {
    console.error("[investors] GET error", err);
    res.status(500).json({ error: "Failed to load prospects" });
  }
});

// ── PATCH /admin/investors/:id ───────────────────────────────────────────────
// Update a prospect's name, route, notes, or status.
investorsRouter.patch("/admin/investors/:id", async (req: Request, res: Response) => {
  if (!(await guard(req, res))) return;
  try {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      route?: string;
      notes?: string;
      status?: string;
    };

    const updates: Partial<{
      name: string;
      route: string;
      notes: string;
      status: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.route !== undefined) updates.route = String(body.route).trim();
    if (body.notes !== undefined) updates.notes = String(body.notes).trim();
    if (body.status !== undefined) updates.status = String(body.status).trim();

    await db
      .update(investorProspectsTable)
      .set(updates)
      .where(eq(investorProspectsTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    console.error("[investors] PATCH prospect error", err);
    res.status(500).json({ error: "Failed to update prospect" });
  }
});

// ── PUT /admin/investors/:id/touches/:touchNumber ────────────────────────────
// Upsert a touch (1, 2, or 3). Creates or updates the row.
investorsRouter.put(
  "/admin/investors/:id/touches/:touchNumber",
  async (req: Request, res: Response) => {
    if (!(await guard(req, res))) return;
    try {
      const { id, touchNumber: touchNumberStr } = req.params as {
        id: string;
        touchNumber: string;
      };
      const touchNumber = parseInt(touchNumberStr, 10);
      if (![1, 2, 3].includes(touchNumber)) {
        res.status(400).json({ error: "touchNumber must be 1, 2, or 3" });
        return;
      }

      const body = req.body as {
        sentAt?: string | null;
        response?: string;
        notes?: string;
      };

      const [existing] = await db
        .select()
        .from(investorTouchesTable)
        .where(
          eq(investorTouchesTable.prospectId, id),
        )
        .then((rows) => rows.filter((r) => r.touchNumber === touchNumber));

      if (existing) {
        await db
          .update(investorTouchesTable)
          .set({
            sentAt: body.sentAt ?? existing.sentAt,
            response:
              body.response !== undefined ? body.response : existing.response,
            notes: body.notes !== undefined ? body.notes : existing.notes,
            updatedAt: new Date(),
          })
          .where(eq(investorTouchesTable.id, existing.id));
      } else {
        await db.insert(investorTouchesTable).values({
          prospectId: id,
          touchNumber,
          sentAt: body.sentAt ?? null,
          response: body.response ?? null,
          notes: body.notes ?? null,
        });
      }

      // Auto-advance prospect status based on highest sent touch.
      if (body.sentAt) {
        const allTouches = await db
          .select()
          .from(investorTouchesTable)
          .where(eq(investorTouchesTable.prospectId, id));
        const sentNumbers = allTouches
          .filter((t) => t.sentAt)
          .map((t) => t.touchNumber);
        const maxSent = sentNumbers.length ? Math.max(...sentNumbers) : 0;
        const statusMap: Record<number, string> = {
          1: "touch_1_sent",
          2: "touch_2_sent",
          3: "touch_3_sent",
        };
        if (maxSent > 0) {
          await db
            .update(investorProspectsTable)
            .set({ status: statusMap[maxSent] ?? "touch_1_sent", updatedAt: new Date() })
            .where(eq(investorProspectsTable.id, id));
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[investors] PUT touch error", err);
      res.status(500).json({ error: "Failed to save touch" });
    }
  },
);

// ── DELETE /admin/investors/:id/touches/:touchNumber ─────────────────────────
// Clear a specific touch row so the slot can be re-used, then recompute status.
investorsRouter.delete(
  "/admin/investors/:id/touches/:touchNumber",
  async (req: Request, res: Response) => {
    if (!(await guard(req, res))) return;
    try {
      const { id, touchNumber: touchNumberStr } = req.params as {
        id: string;
        touchNumber: string;
      };
      const touchNumber = parseInt(touchNumberStr, 10);

      const rows = await db
        .select()
        .from(investorTouchesTable)
        .where(eq(investorTouchesTable.prospectId, id));
      const target = rows.find((r) => r.touchNumber === touchNumber);
      if (target) {
        await db
          .delete(investorTouchesTable)
          .where(eq(investorTouchesTable.id, target.id));
      }

      // Recompute prospect status from remaining sent touches so the status
      // never references a touch that no longer exists.
      const remaining = await db
        .select()
        .from(investorTouchesTable)
        .where(eq(investorTouchesTable.prospectId, id));
      const sentNumbers = remaining
        .filter((t) => t.sentAt)
        .map((t) => t.touchNumber);
      const maxSent = sentNumbers.length ? Math.max(...sentNumbers) : 0;
      const statusMap: Record<number, string> = {
        1: "touch_1_sent",
        2: "touch_2_sent",
        3: "touch_3_sent",
      };
      // Only revert status if it is currently a touch_N_sent value; leave
      // terminal statuses (responded / meeting_booked / passed / closed)
      // that the admin set manually untouched.
      const [prospect] = await db
        .select({ status: investorProspectsTable.status })
        .from(investorProspectsTable)
        .where(eq(investorProspectsTable.id, id));
      const currentStatus = prospect?.status ?? "not_started";
      const autoStatuses = new Set(["not_started", "touch_1_sent", "touch_2_sent", "touch_3_sent"]);
      if (autoStatuses.has(currentStatus)) {
        const newStatus = maxSent > 0 ? (statusMap[maxSent] ?? "touch_1_sent") : "not_started";
        await db
          .update(investorProspectsTable)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(investorProspectsTable.id, id));
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[investors] DELETE touch error", err);
      res.status(500).json({ error: "Failed to delete touch" });
    }
  },
);

// ── POST /admin/investors/check-overdue ──────────────────────────────────────
// Manually trigger the overdue-touch alert check (also runs automatically
// every 24 hours via the scheduler started in index.ts).
// Query param: ?force=1 bypasses the 23-hour dedup guard.
investorsRouter.post(
  "/admin/investors/check-overdue",
  async (req: Request, res: Response) => {
    if (!(await guard(req, res))) return;
    try {
      const force = req.query["force"] === "1";
      const result = await runOverdueAlertCheck(force);
      res.json({
        ok: true,
        overdueCount: result.overdue.length,
        emailSent: result.emailSent,
        skippedRecentSend: result.skippedRecentSend,
        overdue: result.overdue,
      });
    } catch (err) {
      console.error("[investors] check-overdue error", err);
      res.status(500).json({ error: "Overdue check failed" });
    }
  },
);

export default investorsRouter;
