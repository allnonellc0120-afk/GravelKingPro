import { Router, type Request, type Response } from "express";
import { db, promoReferralsTable, usersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { grantCredits } from "../lib/credits";

export const ACTIVE_PROMO_CODE = "GKPRO7DAY";
export const NINA_PROMO_CODE = "NINA";
const PROMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const PROMO_TRIAL_CREDITS = 400;

const promoRouter = Router();

promoRouter.post(["/promo/redeem", "/promo/apply"], async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in required to redeem this promo code.", authRequired: true });
    return;
  }

  const code = String((req.body as { code?: unknown })?.code ?? "").trim().toUpperCase();
  if (code === NINA_PROMO_CODE) {
    const existing = await db
      .select({ id: promoReferralsTable.id })
      .from(promoReferralsTable)
      .where(and(
        eq(promoReferralsTable.referredUserId, req.dbUser.id),
        eq(promoReferralsTable.promoCodeUsed, NINA_PROMO_CODE),
      ));
    if (existing.length > 0) {
      res.status(409).json({ error: "Code already redeemed.", code: NINA_PROMO_CODE });
      return;
    }

    try {
      await db.insert(promoReferralsTable).values({
        referrerName: "Nina",
        referredUserId: req.dbUser.id,
        promoCodeUsed: NINA_PROMO_CODE,
        status: "applied",
      });
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(409).json({ error: "Code already redeemed.", code: NINA_PROMO_CODE });
        return;
      }
      throw err;
    }

    res.json({
      ok: true,
      code: NINA_PROMO_CODE,
      referralTracked: true,
      message: "NINA has been credited to this account.",
    });
    return;
  }
  if (code !== ACTIVE_PROMO_CODE) {
    res.status(400).json({ error: "Invalid promo code." });
    return;
  }

  const now = new Date();
  const currentExpiry = req.dbUser.promoExpiresAt;
  if (req.dbUser.promoCode === ACTIVE_PROMO_CODE && currentExpiry && currentExpiry > now) {
    const creditGrant = await grantCredits(
      req.dbUser.id,
      PROMO_TRIAL_CREDITS,
      "promo_trial",
      `promo:${ACTIVE_PROMO_CODE}:${req.dbUser.id}`,
    );
    res.json({
      ok: true,
      tier: "monthly",
      expiresAt: currentExpiry.toISOString(),
      alreadyRedeemed: true,
      creditsGranted: creditGrant.granted,
      creditsBalance: creditGrant.balance,
    });
    return;
  }

  const expiresAt = new Date(now.getTime() + PROMO_DURATION_MS);
  const [updated] = await db
    .update(usersTable)
    .set({ promoCode: ACTIVE_PROMO_CODE, promoExpiresAt: expiresAt })
    .where(eq(usersTable.id, req.dbUser.id))
    .returning({ promoCode: usersTable.promoCode, promoExpiresAt: usersTable.promoExpiresAt });

  const creditGrant = await grantCredits(
    req.dbUser.id,
    PROMO_TRIAL_CREDITS,
    "promo_trial",
    `promo:${ACTIVE_PROMO_CODE}:${req.dbUser.id}`,
  );
  res.json({
    ok: true,
    tier: "monthly",
    expiresAt: updated.promoExpiresAt?.toISOString() ?? expiresAt.toISOString(),
    creditsGranted: creditGrant.granted,
    creditsBalance: creditGrant.balance,
  });
});

// Admin-only Nina campaign report. Conversion means a paid invoice, not signup.
promoRouter.get("/admin/promo/nina", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!(await requireAdmin(req, res))) return;
  try {
    const referrals = await db
      .select({
        id: promoReferralsTable.id,
        referrerName: promoReferralsTable.referrerName,
        referredUserId: promoReferralsTable.referredUserId,
        promoCodeUsed: promoReferralsTable.promoCodeUsed,
        status: promoReferralsTable.status,
        createdAt: promoReferralsTable.createdAt,
        convertedAt: promoReferralsTable.convertedAt,
        stripeInvoiceId: promoReferralsTable.stripeInvoiceId,
        email: usersTable.email,
      })
      .from(promoReferralsTable)
      .leftJoin(usersTable, eq(usersTable.id, promoReferralsTable.referredUserId))
      .where(eq(promoReferralsTable.promoCodeUsed, NINA_PROMO_CODE))
      .orderBy(desc(promoReferralsTable.createdAt));

    res.json({
      promoCode: NINA_PROMO_CODE,
      referrerName: "Nina",
      totalReferred: referrals.length,
      totalConversions: referrals.filter((row) => row.status === "converted").length,
      referrals,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load Nina referrals." });
  }
});

export default promoRouter;