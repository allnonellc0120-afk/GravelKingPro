/**
 * Analytics — first-party traffic + conversion funnel
 *
 * Public:
 *   POST /api/analytics/track    — pageview beacon (sets gk_vid cookie, rate-limited)
 *
 * Admin (X-Admin-Key header required):
 *   GET  /api/analytics/summary  — funnel metrics + live Stripe MRR snapshot
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db, analyticsEventsTable, emailCaptureTable } from "@workspace/db";
import { recordAnalyticsEvent } from "../analytics";
import { getUncachableStripeClient } from "../stripeClient";
import { createHash } from "crypto";

const analyticsRouter = Router();

// ── Simple in-memory rate limiter for the public beacon ──────────────────────
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

// Periodically drop expired buckets so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(key);
  }
}, 5 * 60_000).unref();

function clientKey(req: Request): string {
  // Behind the Replit proxy req.ip is the proxy address, so prefer the
  // forwarded client IP. This keys abuse limits per-browser/IP rather than
  // lumping every visitor together. (Non-security; spoofing only bloats rows.)
  const xff = req.headers["x-forwarded-for"];
  const fromXff = Array.isArray(xff) ? xff[0] : xff?.split(",")[0]?.trim();
  return fromXff || req.ip || "unknown";
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// Admin guard imported from shared lib (accepts httpOnly cookie or x-admin-key header).
import { requireAdmin } from "../lib/adminAuth";

// Normalize a recurring price to a monthly amount (in cents).
function monthlyCentsFor(price: Stripe.Price, quantity: number): number {
  const amount = (price.unit_amount ?? 0) * quantity;
  const interval = price.recurring?.interval;
  const count = price.recurring?.interval_count ?? 1;
  if (!interval || count <= 0) return 0;
  switch (interval) {
    case "month":
      return amount / count;
    case "year":
      return amount / (12 * count);
    case "week":
      return (amount * 52) / (12 * count);
    case "day":
      return (amount * 365) / (12 * count);
    default:
      return 0;
  }
}

// ── Public beacon — records pageviews only ───────────────────────────────────
analyticsRouter.post("/analytics/track", async (req: Request, res: Response) => {
  try {
    const cookies = (req.cookies as Record<string, string>) ?? {};

    const rateKey = cookies.gk_vid || clientKey(req);
    if (isRateLimited(rateKey)) {
      res.status(429).json({ ok: false });
      return;
    }

    const body = (req.body ?? {}) as { path?: unknown; referrer?: unknown };
    const path = clampString(body.path, 512);
    const referrer = clampString(body.referrer, 512);

    let visitorId = cookies.gk_vid;
    if (!visitorId) {
      visitorId = randomUUID();
      res.cookie("gk_vid", visitorId, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }
    const sessionId = cookies.gk_session ?? null;

    await recordAnalyticsEvent({ type: "pageview", visitorId, sessionId, path, referrer });
    res.json({ ok: true });
  } catch (err: unknown) {
    req.log?.error({ err }, "analytics track failed");
    // Tracking must never surface as a client error.
    res.status(200).json({ ok: false });
  }
});

// ── Admin: funnel summary + live revenue snapshot ────────────────────────────
analyticsRouter.get("/analytics/summary", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const daysRaw = parseInt(String(req.query.days ?? "30"), 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totals] = await db
      .select({
        pageviews: sql<number>`count(*) filter (where ${analyticsEventsTable.type} = 'pageview')`,
        uniqueVisitors: sql<number>`count(distinct ${analyticsEventsTable.visitorId}) filter (where ${analyticsEventsTable.type} = 'pageview')`,
        checkoutStarts: sql<number>`count(*) filter (where ${analyticsEventsTable.type} = 'checkout_started')`,
      })
      .from(analyticsEventsTable)
      .where(gte(analyticsEventsTable.createdAt, since));

    const seriesRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt}), 'YYYY-MM-DD')`,
        pageviews: sql<number>`count(*) filter (where ${analyticsEventsTable.type} = 'pageview')`,
        visitors: sql<number>`count(distinct ${analyticsEventsTable.visitorId}) filter (where ${analyticsEventsTable.type} = 'pageview')`,
        checkoutStarts: sql<number>`count(*) filter (where ${analyticsEventsTable.type} = 'checkout_started')`,
      })
      .from(analyticsEventsTable)
      .where(gte(analyticsEventsTable.createdAt, since))
      .groupBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})`)
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})`);

    const topPaths = await db
      .select({ path: analyticsEventsTable.path, count: sql<number>`count(*)` })
      .from(analyticsEventsTable)
      .where(
        and(
          gte(analyticsEventsTable.createdAt, since),
          eq(analyticsEventsTable.type, "pageview"),
          isNotNull(analyticsEventsTable.path),
        ),
      )
      .groupBy(analyticsEventsTable.path)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const topReferrers = await db
      .select({ referrer: analyticsEventsTable.referrer, count: sql<number>`count(*)` })
      .from(analyticsEventsTable)
      .where(
        and(
          gte(analyticsEventsTable.createdAt, since),
          eq(analyticsEventsTable.type, "pageview"),
          isNotNull(analyticsEventsTable.referrer),
        ),
      )
      .groupBy(analyticsEventsTable.referrer)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // Live subscription / MRR snapshot from Stripe (all-time, current state).
    let activeSubs = 0;
    let trialingSubs = 0;
    let pastDueSubs = 0;
    let mrrCents = 0;
    let recentRevenueCents = 0; // successful charges in the selected window
    let lifetimeRevenueCents = 0; // all successful charge amounts ever
    let stripeOk = true;
    try {
      const stripe = await getUncachableStripeClient();

      // Count subscriptions across all paying statuses
      for (const status of ["active", "trialing", "past_due", "incomplete"] as const) {
        let startingAfter: string | undefined;
        for (;;) {
          const page = await stripe.subscriptions.list({
            status,
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          });
          for (const sub of page.data) {
            if (status === "active") activeSubs += 1;
            else if (status === "trialing") trialingSubs += 1;
            else pastDueSubs += 1;
            // Only count active + trialing toward MRR (past_due may never collect)
            if (status === "active" || status === "trialing") {
              for (const item of sub.items.data) {
                mrrCents += monthlyCentsFor(item.price, item.quantity ?? 1);
              }
            }
          }
          if (!page.has_more || page.data.length === 0) break;
          startingAfter = page.data[page.data.length - 1]?.id;
        }
      }

      // Recent + lifetime revenue from successful charges
      const windowStart = Math.floor(since.getTime() / 1000);
      let chargeAfter: string | undefined;
      for (;;) {
        const page = await stripe.charges.list({
          limit: 100,
          ...(chargeAfter ? { starting_after: chargeAfter } : {}),
        });
        for (const charge of page.data) {
          if (charge.paid && !charge.refunded) {
            lifetimeRevenueCents += charge.amount;
            if (charge.created >= windowStart) {
              recentRevenueCents += charge.amount;
            }
          }
        }
        if (!page.has_more || page.data.length === 0) break;
        // Stop paginating once all charges are older than window
        const oldest = page.data[page.data.length - 1];
        if (oldest && oldest.created < windowStart - 86400 * 365) break; // 1yr hard stop
        chargeAfter = oldest?.id;
      }
    } catch (err: unknown) {
      stripeOk = false;
      req.log?.warn({ err }, "stripe summary fetch failed");
    }

    const pageviews = Number(totals?.pageviews ?? 0);
    const uniqueVisitors = Number(totals?.uniqueVisitors ?? 0);
    const checkoutStarts = Number(totals?.checkoutStarts ?? 0);
    const payingTotal = activeSubs + trialingSubs;

    const pct = (num: number, den: number): number =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    res.json({
      rangeDays: days,
      totals: { pageviews, uniqueVisitors, checkoutStarts },
      subscriptions: {
        active: activeSubs,
        trialing: trialingSubs,
        pastDue: pastDueSubs,
        total: payingTotal,
        mrr: Math.round(mrrCents) / 100,
        recentRevenue: Math.round(recentRevenueCents) / 100,
        lifetimeRevenue: Math.round(lifetimeRevenueCents) / 100,
        stripeOk,
      },
      conversion: {
        visitorToCheckoutPct: pct(checkoutStarts, uniqueVisitors),
        visitorToPaidPct: pct(payingTotal, uniqueVisitors),
        checkoutToPaidPct: pct(payingTotal, checkoutStarts),
      },
      series: seriesRows.map((r) => ({
        day: r.day,
        pageviews: Number(r.pageviews),
        visitors: Number(r.visitors),
        checkoutStarts: Number(r.checkoutStarts),
      })),
      topPaths: topPaths.map((r) => ({ path: r.path, count: Number(r.count) })),
      topReferrers: topReferrers.map((r) => ({ referrer: r.referrer, count: Number(r.count) })),
    });
  } catch (err: unknown) {
    req.log?.error({ err }, "analytics summary failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ── Public: email capture after free usage ───────────────────────────────────
analyticsRouter.post("/capture-email", async (req: Request, res: Response) => {
  try {
    const body = req.body as { email?: string; source?: string };
    const email = clampString(body.email, 255)?.trim().toLowerCase();
    const source = clampString(body.source, 50) ?? "unknown";
    if (!email || !email.includes("@")) {
      res.status(400).json({ ok: false, error: "Valid email required" });
      return;
    }
    const ipHash = createHash("sha256")
      .update(String(req.headers["x-forwarded-for"] || req.ip || "unknown"))
      .digest("hex");
    const referrer = clampString(req.headers.referer, 512);
    const userAgent = clampString(req.headers["user-agent"], 500);

    await db.insert(emailCaptureTable).values({
      email,
      source,
      referrer,
      userAgent,
      ipHash,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    req.log?.warn({ err }, "email capture failed");
    res.status(200).json({ ok: false });
  }
});

export default analyticsRouter;
