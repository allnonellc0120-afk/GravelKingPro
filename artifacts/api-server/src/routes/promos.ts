import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const ACTIVE_PROMO_CODE = "GKPRO7DAY";
const PROMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const promoRouter = Router();

promoRouter.post("/promo/redeem", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in required to redeem this promo code.", authRequired: true });
    return;
  }

  const code = String((req.body as { code?: unknown })?.code ?? "").trim().toUpperCase();
  if (code !== ACTIVE_PROMO_CODE) {
    res.status(400).json({ error: "Invalid promo code." });
    return;
  }

  const now = new Date();
  const currentExpiry = req.dbUser.promoExpiresAt;
  if (req.dbUser.promoCode === ACTIVE_PROMO_CODE && currentExpiry && currentExpiry > now) {
    res.json({ ok: true, tier: "monthly", expiresAt: currentExpiry.toISOString(), alreadyRedeemed: true });
    return;
  }

  const expiresAt = new Date(now.getTime() + PROMO_DURATION_MS);
  const [updated] = await db
    .update(usersTable)
    .set({ promoCode: ACTIVE_PROMO_CODE, promoExpiresAt: expiresAt })
    .where(eq(usersTable.id, req.dbUser.id))
    .returning({ promoCode: usersTable.promoCode, promoExpiresAt: usersTable.promoExpiresAt });

  res.json({ ok: true, tier: "monthly", expiresAt: updated.promoExpiresAt?.toISOString() ?? expiresAt.toISOString() });
});

export default promoRouter;