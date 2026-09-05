import { db, usersTable, playSubscriptionsTable } from '@workspace/db';
import { desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { User } from '@workspace/db';
import { verifyPlaySubscription, PlayTokenInvalidError } from './lib/playBilling';

/** Map a subscription's price/product into a canonical tier string. */
function deriveTier(
  metaTier: string | null,
  interval: string | null,
  unitAmount: number | null,
  productName: string | null = null,
): 'free' | 'pro' | 'king' | 'node_auditor' {
  if (metaTier === 'king' || metaTier === 'node_auditor') return metaTier;
  if (metaTier === 'pro') {
    // Historical `pro` metadata represented the higher legacy entitlement.
    // Only this retained product identity denotes the new $9.99 Pro plan.
    return productName === 'GravelKing Weekly' ? 'pro' : 'king';
  }
  // Legacy metadata values from the previous pricing structure.
  if (metaTier === 'weekly' || metaTier === 'splits') return 'pro';
  if (metaTier === 'monthly') return 'king';

  // Fall back to deriving from the price shape.
  if ((unitAmount ?? 0) >= 40000) return 'node_auditor';
  if (interval === 'week') return 'pro';
  if (interval === 'month') return (unitAmount ?? 0) >= 2000 ? 'king' : 'pro';
  return 'free';
}

export class Storage {
  async getUserBySession(sessionId: string): Promise<User | null> {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.sessionId, sessionId));
    return user ?? null;
  }

  async getOrCreateUser(sessionId: string): Promise<User> {
    const existing = await this.getUserBySession(sessionId);
    if (existing) return existing;

    const id = randomUUID();
    const [user] = await db.insert(usersTable).values({ id, sessionId }).returning();
    return user;
  }

  async getUserSubscriptionStatus(
    user: User,
  ): Promise<{ isPro: boolean; plan: string | null; tier: string | null; isDeveloper?: boolean }> {
    if (user.isDeveloper) {
      return { isPro: true, plan: 'Node Auditor', tier: 'node_auditor', isDeveloper: true };
    }

    // Lifetime / manually-granted access: honour the tier stored directly on the
    // user row.  Any row with is_pro=true and a subscription_tier set bypasses
    // Stripe entirely — this covers gifted / admin-granted access.
    if (user.isPro && user.subscriptionTier) {
      const t = user.subscriptionTier as string;
      const plan =
        t === 'node_auditor' ? 'Node Auditor'
        : t === 'king' || t === 'monthly' ? 'King'
        : t === 'pro' || t === 'weekly' ? 'Pro'
        : null;
      return { isPro: true, plan, tier: t, isDeveloper: user.isDeveloper ?? false };
    }

    // Google Play subscription (purchased inside the Android app). Checked
    // before Stripe so Play-only users — who have no stripeCustomerId — get
    // their entitlement on every platform, web included.
    // Errors in the Play path must never block the Stripe evaluation below.
    let play: { isPro: boolean; plan: string | null; tier: string } | null = null;
    try {
      play = await this.getPlaySubscriptionStatus(user.id);
    } catch {
      play = null;
    }
    if (play) return { ...play, isDeveloper: user.isDeveloper ?? false };

    if (!user.stripeCustomerId) {
      return { isPro: false, plan: null, tier: null };
    }

    // Resolve the active subscription's tier through its price/product.
    // Prefer explicit product metadata.tier; fall back to price shape.
    const result = await db.execute(
      sql`SELECT p.metadata->>'tier' AS tier_meta,
                 p.name AS product_name,
                 pr.recurring->>'interval' AS interval,
                 pr.unit_amount AS unit_amount
          FROM stripe.subscriptions s
          JOIN stripe.subscription_items si ON si.subscription = s.id
          JOIN stripe.prices pr ON pr.id = si.price
          LEFT JOIN stripe.products p ON p.id = pr.product
          WHERE s.customer = ${user.stripeCustomerId}
          AND s.status IN ('active', 'trialing')
          ORDER BY pr.unit_amount DESC NULLS LAST
          LIMIT 1`,
    );

    if (result.rows.length === 0) {
      // DB mirror may be stale (webhook delivery failures can delay mirroring).
      // Fall back to a live Stripe API check before returning "no subscription".
      try {
        const { getUncachableStripeClient } = await import('./stripeClient');
        const stripe = await getUncachableStripeClient();
        for (const status of ['active', 'trialing'] as const) {
          const list = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status,
            limit: 1,
            expand: ['data.items.data.price.product'],
          });
          if (list.data.length > 0) {
            const sub  = list.data[0];
            const item = sub.items.data[0];
            const price    = item?.price as any;
            const tierMeta = (price?.product as any)?.metadata?.tier ?? null;
            const productName = (price?.product as any)?.name ?? null;
            const interval = price?.recurring?.interval ?? null;
            const amount   = price?.unit_amount ?? null;
            const tier     = deriveTier(tierMeta, interval, amount, productName);
            const plan =
              tier === 'node_auditor' ? 'Node Auditor'
              : tier === 'king'       ? 'King'
              : tier === 'pro'        ? 'Pro'
              : null;
            return { isPro: tier !== 'free', plan, tier };
          }
        }
      } catch { /* Stripe unreachable — fall through to free */ }
      return { isPro: false, plan: null, tier: null };
    }

    const row = result.rows[0] as Record<string, unknown>;
    const tier = deriveTier(
      row.tier_meta as string | null,
      row.interval as string | null,
      row.unit_amount as number | null,
      row.product_name as string | null,
    );

    const plan =
      tier === 'node_auditor'
        ? 'Node Auditor'
        : tier === 'king'
          ? 'King'
          : tier === 'pro'
            ? 'Pro'
            : null;

    return { isPro: tier !== 'free', plan, tier };
  }

  /**
   * Active Google Play entitlement for a user, or null.
   *
   * There is no realtime notification pipeline from Google, so renewals are
   * picked up lazily: when the cached expiryTime has passed, the freshest
   * token is re-verified against the Play Developer API (throttled to once
   * per 5 minutes) — a renewed subscription extends expiryTime, an expired
   * one gets its state persisted so we stop asking.
   */
  private async getPlaySubscriptionStatus(
    userId: string,
  ): Promise<{ isPro: boolean; plan: string | null; tier: string } | null> {
    // One verification ATTEMPT (success or failure) per window — a Google
    // outage must not turn every status read into an API call.
    const VERIFY_THROTTLE_MS = 5 * 60_000;
    // Bounded fail-open: when Google can't be reached to confirm a renewal,
    // a subscription last confirmed entitled keeps access this long past its
    // cached expiry. Real renewals are confirmed on the first successful
    // retry; real lapses are revoked the moment Google answers "expired".
    const OUTAGE_GRACE_MS = 48 * 60 * 60 * 1000;

    const rows = await db
      .select()
      .from(playSubscriptionsTable)
      .where(eq(playSubscriptionsTable.userId, userId))
      .orderBy(desc(playSubscriptionsTable.expiryTime));
    // "canceled" = auto-renew off but paid period still running.
    const candidates = rows.filter((r) => ['active', 'grace', 'canceled'].includes(r.state));
    if (candidates.length === 0) return null;

    const now = Date.now();
    const live = candidates.find((r) => r.expiryTime && r.expiryTime.getTime() > now);
    if (live) return this.playTierStatus(live.tier);

    // Cached expiry passed — the subscription may have renewed (no RTDN
    // pipeline; renewals are picked up lazily here).
    const stale = candidates[0];
    const inOutageGrace =
      stale.expiryTime !== null && now - stale.expiryTime.getTime() < OUTAGE_GRACE_MS;
    if (now - stale.lastVerifiedAt.getTime() < VERIFY_THROTTLE_MS) {
      return inOutageGrace ? this.playTierStatus(stale.tier) : null;
    }

    try {
      const v = await verifyPlaySubscription(stale.purchaseToken);
      await db
        .update(playSubscriptionsTable)
        .set({
          state: v.state,
          expiryTime: v.expiryTime,
          autoRenewing: v.autoRenewing,
          productId: v.productId ?? stale.productId,
          tier: v.tier ?? stale.tier,
          lastVerifiedAt: new Date(),
        })
        .where(eq(playSubscriptionsTable.id, stale.id));
      // Google answered: entitle or revoke immediately — no grace needed.
      if (v.entitled && v.tier) return this.playTierStatus(v.tier);
      return null;
    } catch (err) {
      if (err instanceof PlayTokenInvalidError) {
        await db
          .update(playSubscriptionsTable)
          .set({ state: 'invalid', lastVerifiedAt: new Date() })
          .where(eq(playSubscriptionsTable.id, stale.id));
        return null;
      }
      // Transient Google failure: record the attempt so the throttle holds,
      // and keep the prior entitlement within the bounded grace window.
      try {
        await db
          .update(playSubscriptionsTable)
          .set({ lastVerifiedAt: new Date() })
          .where(eq(playSubscriptionsTable.id, stale.id));
      } catch {
        /* best effort — never let bookkeeping break the status read */
      }
      return inOutageGrace ? this.playTierStatus(stale.tier) : null;
    }
  }

  private playTierStatus(tier: string): { isPro: boolean; plan: string | null; tier: string } {
    const plan =
      tier === 'node_auditor' ? 'Node Auditor'
      : tier === 'king'       ? 'King'
      : tier === 'pro'        ? 'Pro'
      : null;
    return { isPro: plan !== null, plan, tier };
  }

  async linkStripeCustomer(userId: string, stripeCustomerId: string): Promise<User> {
    const [user] = await db
      .update(usersTable)
      .set({ stripeCustomerId })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  async listProductsWithPrices(): Promise<unknown[]> {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, active
          FROM stripe.products
          WHERE active = true
          ORDER BY id
        )
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result.rows;
  }

  async markTrialUsed(userId: string): Promise<void> {
    await db.update(usersTable).set({ trialUsed: true }).where(eq(usersTable.id, userId));
  }

  async getPriceIdForProduct(productName: string): Promise<string | null> {
    const result = await db.execute(
      sql`SELECT pr.id FROM stripe.prices pr
          JOIN stripe.products p ON p.id = pr.product
          WHERE p.name = ${productName}
          AND pr.active = true
          AND p.active = true
          LIMIT 1`
    );
    return (result.rows[0] as Record<string, unknown>)?.id as string ?? null;
  }
}

export const storage = new Storage();
