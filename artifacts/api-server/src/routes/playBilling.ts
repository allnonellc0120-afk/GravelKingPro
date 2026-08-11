import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, playSubscriptionsTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import {
  verifyPlaySubscription,
  acknowledgePlaySubscription,
  PlayTokenInvalidError,
} from '../lib/playBilling';

const playBillingRouter = Router();

// Link a Google Play subscription purchase (made in the Android app via the
// Digital Goods API) to the signed-in account. The client sends only the
// purchaseToken; product, state, and expiry all come from Google — we never
// trust client-claimed values. Idempotent: re-sending a token re-syncs it,
// which is how "restore purchases" works after a reinstall.
playBillingRouter.post('/play/verify-purchase', async (req: Request, res: Response) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({
        error: 'Sign in required to activate a Google Play purchase',
        authRequired: true,
      });
      return;
    }
    const userId = req.dbUser.id;

    const { purchaseToken } = req.body as { purchaseToken?: string };
    if (!purchaseToken || typeof purchaseToken !== 'string') {
      res.status(400).json({ error: 'purchaseToken is required' });
      return;
    }

    let v;
    try {
      v = await verifyPlaySubscription(purchaseToken);
    } catch (err) {
      if (err instanceof PlayTokenInvalidError) {
        res.status(400).json({
          error:
            'Google Play did not recognize this purchase. If you were just charged, wait a moment and try again.',
        });
        return;
      }
      throw err;
    }

    if (!v.productId || !v.tier) {
      res.status(400).json({ error: 'Purchase is not for a known subscription product' });
      return;
    }
    if (!v.entitled) {
      res.status(400).json({ error: `This subscription is not active (${v.state}).` });
      return;
    }

    const fields = {
      productId: v.productId,
      tier: v.tier,
      state: v.state,
      expiryTime: v.expiryTime,
      autoRenewing: v.autoRenewing,
      lastVerifiedAt: new Date(),
    };

    // One purchase unlocks one account, ever. The claim rides the unique
    // purchaseToken index inside a transaction, so two accounts racing the
    // same token get a deterministic outcome: exactly one owns the row, the
    // other gets a 409 (same-user retries stay idempotent).
    const claim = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(playSubscriptionsTable)
        .values({ userId, purchaseToken, ...fields, acknowledged: !v.acknowledgementPending })
        .onConflictDoNothing({ target: playSubscriptionsTable.purchaseToken })
        .returning();

      if (inserted.length === 0) {
        const [existing] = await tx
          .select()
          .from(playSubscriptionsTable)
          .where(eq(playSubscriptionsTable.purchaseToken, purchaseToken));
        if (!existing) throw new Error('Failed to record the purchase — please retry');
        if (existing.userId !== userId) return { conflict: true as const };
        await tx
          .update(playSubscriptionsTable)
          .set({ ...fields, acknowledged: existing.acknowledged || !v.acknowledgementPending })
          .where(eq(playSubscriptionsTable.id, existing.id));
      }

      // Upgrades/resubscribes issue a new token that replaces an old one.
      // Retire the predecessor only if it belongs to THIS user — a linked
      // token must never let one account retire another account's row.
      if (v.linkedPurchaseToken) {
        await tx
          .update(playSubscriptionsTable)
          .set({ state: 'replaced' })
          .where(
            and(
              eq(playSubscriptionsTable.purchaseToken, v.linkedPurchaseToken),
              eq(playSubscriptionsTable.userId, userId),
            ),
          );
      }
      return { conflict: false as const };
    });

    if (claim.conflict) {
      res.status(409).json({
        error: 'This Google Play purchase is already linked to a different account.',
      });
      return;
    }

    // Google auto-refunds unacknowledged purchases after 3 days. Acknowledge
    // only after the claim is secured (never acknowledge a token another
    // account owns), then record success so we don't re-ask.
    if (v.acknowledgementPending) {
      await acknowledgePlaySubscription(v.productId, purchaseToken);
      await db
        .update(playSubscriptionsTable)
        .set({ acknowledged: true })
        .where(eq(playSubscriptionsTable.purchaseToken, purchaseToken));
    }

    const plan =
      v.tier === 'node_auditor' ? 'Node Auditor'
      : v.tier === 'monthly' ? 'Studio'
      : 'Weekly';
    res.json({ ok: true, isPro: true, plan, tier: v.tier });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export { playBillingRouter };
export default playBillingRouter;
