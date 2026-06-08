import { db, usersTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { User } from '@workspace/db';

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

  async getUserSubscriptionStatus(user: User): Promise<{ isPro: boolean; plan: string | null }> {
    if (!user.stripeCustomerId) {
      return { isPro: false, plan: null };
    }

    const result = await db.execute(
      sql`SELECT s.id, s.status
          FROM stripe.subscriptions s
          WHERE s.customer = ${user.stripeCustomerId}
          AND s.status IN ('active', 'trialing')
          LIMIT 1`
    );

    if (result.rows.length === 0) {
      return { isPro: false, plan: null };
    }

    return { isPro: true, plan: 'Pro' };
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
