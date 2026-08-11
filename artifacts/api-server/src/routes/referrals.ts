import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  db,
  promotersTable,
  referralClicksTable,
  referralAttributionsTable,
  commissionsTable,
} from '@workspace/db';
import { eq, and, desc, count, sql } from 'drizzle-orm';

const referralsRouter = Router();

const REF_COOKIE = 'gk_ref';
const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateCode(): string {
  // 8 chars, unambiguous alphabet
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

async function requireAdminGuard(req: Request, res: Response): Promise<boolean> {
  const { requireAdmin } = await import('../lib/adminAuth');
  return requireAdmin(req, res);
}

// ── Public: record a tracked-link click ─────────────────────────────────────
// The frontend posts here when it sees ?ref=CODE. Sets an httpOnly cookie so
// the attribution survives navigation and the Stripe checkout redirect.
referralsRouter.post('/referral/click', async (req: Request, res: Response) => {
  try {
    const code = String((req.body as { code?: string })?.code ?? '').trim().toUpperCase();
    if (!code || code.length > 32) {
      res.status(400).json({ error: 'Invalid code' });
      return;
    }

    const [promoter] = await db
      .select()
      .from(promotersTable)
      .where(eq(promotersTable.code, code));

    if (!promoter || promoter.status !== 'approved') {
      // Don't leak which codes exist.
      res.json({ ok: true });
      return;
    }

    const cookies = req.cookies as Record<string, string>;
    const alreadyTracked = cookies?.[REF_COOKIE] === code;

    res.cookie(REF_COOKIE, code, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: REF_COOKIE_MAX_AGE,
      path: '/',
    });

    // Count one click per browser per code (cookie-deduped) to keep the
    // dashboard honest against reload inflation.
    if (!alreadyTracked) {
      await db.insert(referralClicksTable).values({
        promoterId: promoter.id,
        visitorId: cookies?.gk_vid ?? null,
      });
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ── Promoter: register ───────────────────────────────────────────────────────
referralsRouter.post('/promoter/register', async (req: Request, res: Response) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'Sign in required to become a promoter', authRequired: true });
      return;
    }

    const { displayName, payoutDetails } = (req.body ?? {}) as {
      displayName?: string;
      payoutDetails?: string;
    };

    const [existing] = await db
      .select()
      .from(promotersTable)
      .where(eq(promotersTable.userId, req.dbUser.id));
    if (existing) {
      res.json({ promoter: existing, existing: true });
      return;
    }

    // Retry on the (astronomically rare) code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [promoter] = await db
          .insert(promotersTable)
          .values({
            userId: req.dbUser.id,
            code: generateCode(),
            displayName: displayName?.slice(0, 100) ?? null,
            payoutDetails: payoutDetails?.slice(0, 500) ?? null,
          })
          .returning();
        res.json({ promoter });
        return;
      } catch (err: any) {
        if (err?.code === '23505' && attempt < 2) continue; // unique violation → retry code
        throw err;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ── Promoter: dashboard data ─────────────────────────────────────────────────
referralsRouter.get('/promoter/me', async (req: Request, res: Response) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'Sign in required', authRequired: true });
      return;
    }

    const [promoter] = await db
      .select()
      .from(promotersTable)
      .where(eq(promotersTable.userId, req.dbUser.id));

    if (!promoter) {
      res.json({ promoter: null });
      return;
    }

    const [[clicks], [conversions], commissions] = await Promise.all([
      db.select({ n: count() }).from(referralClicksTable)
        .where(eq(referralClicksTable.promoterId, promoter.id)),
      db.select({ n: count() }).from(referralAttributionsTable)
        .where(eq(referralAttributionsTable.promoterId, promoter.id)),
      db.select().from(commissionsTable)
        .where(eq(commissionsTable.promoterId, promoter.id))
        .orderBy(desc(commissionsTable.createdAt))
        .limit(100),
    ]);

    const sumCents = (status: string) =>
      commissions.filter((c) => c.status === status).reduce((a, c) => a + c.commissionCents, 0);

    res.json({
      promoter,
      stats: {
        clicks: clicks?.n ?? 0,
        conversions: conversions?.n ?? 0,
        pendingCents: sumCents('pending'),
        paidCents: sumCents('paid'),
      },
      commissions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ── Admin: list promoters with stats ────────────────────────────────────────
referralsRouter.get('/admin/promoters', async (req: Request, res: Response) => {
  if (!(await requireAdminGuard(req, res))) return;
  try {
    const promoters = await db
      .select()
      .from(promotersTable)
      .orderBy(desc(promotersTable.createdAt));

    const stats = await db.execute(sql`
      SELECT p.id AS promoter_id,
        (SELECT COUNT(*) FROM referral_clicks rc WHERE rc.promoter_id = p.id) AS clicks,
        (SELECT COUNT(*) FROM referral_attributions ra WHERE ra.promoter_id = p.id) AS conversions,
        COALESCE(SUM(c.commission_cents) FILTER (WHERE c.status = 'pending'), 0) AS pending_cents,
        COALESCE(SUM(c.commission_cents) FILTER (WHERE c.status = 'paid'), 0) AS paid_cents
      FROM promoters p
      LEFT JOIN commissions c ON c.promoter_id = p.id
      GROUP BY p.id
    `) as unknown as { rows: Array<{ promoter_id: string; clicks: string; conversions: string; pending_cents: string; paid_cents: string }> };

    const byId = new Map((stats.rows ?? []).map((r) => [r.promoter_id, r]));
    res.json({
      promoters: promoters.map((p) => {
        const s = byId.get(p.id);
        return {
          ...p,
          clicks: Number(s?.clicks ?? 0),
          conversions: Number(s?.conversions ?? 0),
          pendingCents: Number(s?.pending_cents ?? 0),
          paidCents: Number(s?.paid_cents ?? 0),
        };
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ── Admin: approve / reject ──────────────────────────────────────────────────
referralsRouter.post('/admin/promoters/:id/status', async (req: Request, res: Response) => {
  if (!(await requireAdminGuard(req, res))) return;
  try {
    const status = String((req.body as { status?: string })?.status ?? '');
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      res.status(400).json({ error: 'status must be approved, rejected, or pending' });
      return;
    }
    const [updated] = await db
      .update(promotersTable)
      .set({ status })
      .where(eq(promotersTable.id, String(req.params.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'Promoter not found' });
      return;
    }
    res.json({ promoter: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ── Admin: mark all pending commissions for a promoter as paid ──────────────
referralsRouter.post('/admin/promoters/:id/mark-paid', async (req: Request, res: Response) => {
  if (!(await requireAdminGuard(req, res))) return;
  try {
    const updated = await db
      .update(commissionsTable)
      .set({ status: 'paid', paidAt: new Date() })
      .where(and(
        eq(commissionsTable.promoterId, String(req.params.id)),
        eq(commissionsTable.status, 'pending'),
      ))
      .returning();
    res.json({ marked: updated.length, totalCents: updated.reduce((a, c) => a + c.commissionCents, 0) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default referralsRouter;
