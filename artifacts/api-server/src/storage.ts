import { db, usersTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { User } from '@workspace/db';

/** Map a subscription's price/product into a canonical tier string. */
function deriveTier(
  metaTier: string | null,
  interval: string | null,
  unitAmount: number | null,
): 'free' | 'weekly' | 'monthly' | 'node_auditor' {
  if (metaTier === 'weekly' || metaTier === 'monthly' || metaTier === 'node_auditor') {
    return metaTier;
  }
  // Legacy metadata values from the previous pricing structure.
  if (metaTier === 'splits') return 'weekly';
  if (metaTier === 'pro') return 'monthly';

  // Fall back to deriving from the price shape.
  if ((unitAmount ?? 0) >= 40000) return 'node_auditor';
  if (interval === 'week') return 'weekly';
  if (interval === 'month') return 'monthly';
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
    // Lifetime / manually-granted access: honour the tier stored directly on the
    // user row.  Any row with is_pro=true and a subscription_tier set bypasses
    // Stripe entirely — this covers gifted / admin-granted access.
    if (user.isPro && user.subscriptionTier) {
      const t = user.subscriptionTier as string;
      const plan =
        t === 'node_auditor' ? 'Node Auditor'
        : t === 'monthly'    ? 'Studio'
        : t === 'weekly'     ? 'Weekly'
        : null;
      return { isPro: true, plan, tier: t, isDeveloper: user.isDeveloper ?? false };
    }

    if (!user.stripeCustomerId) {
      return { isPro: false, plan: null, tier: null };
    }

    // Resolve the active subscription's tier through its price/product.
    // Prefer explicit product metadata.tier; fall back to price shape.
    const result = await db.execute(
      sql`SELECT p.metadata->>'tier' AS tier_meta,
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
            const interval = price?.recurring?.interval ?? null;
            const amount   = price?.unit_amount ?? null;
            const tier     = deriveTier(tierMeta, interval, amount);
            const plan =
              tier === 'node_auditor' ? 'Node Auditor'
              : tier === 'monthly'    ? 'Studio'
              : tier === 'weekly'     ? 'Weekly'
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
    );

    const plan =
      tier === 'node_auditor'
        ? 'Node Auditor'
        : tier === 'monthly'
          ? 'Studio'
          : tier === 'weekly'
            ? 'Weekly'
            : null;

    return { isPro: tier !== 'free', plan, tier };
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
