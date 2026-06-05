import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';

export class StripeStorage {
  async listProductsWithPrices(active = true) {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
        )
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
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

  async getSubscriptionByCustomer(stripeCustomerId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE customer = ${stripeCustomerId} AND status = 'active' LIMIT 1`
    );
    return result.rows[0] ?? null;
  }

  async getUserByEmail(email: string) {
    const result = await db.execute(
      sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`
    );
    return result.rows[0] ?? null;
  }

  async upsertUser(id: string, email: string, stripeCustomerId?: string) {
    await db.execute(
      sql`
        INSERT INTO users (id, email, stripe_customer_id)
        VALUES (${id}, ${email}, ${stripeCustomerId ?? null})
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id)
      `
    );
  }
}

export const stripeStorage = new StripeStorage();
