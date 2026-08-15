import type Stripe from "stripe";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { withIdempotencyRetry } from "./stripeIdempotency";

/**
 * Returns a Stripe customer ID that is valid on the CURRENTLY connected
 * Stripe account, reminting and relinking when the stored one is stale.
 *
 * Why: customer IDs are account-scoped. Users created while the managed
 * connection pointed at the dev sandbox (or an older account) carry a
 * stripeCustomerId that does not exist on the live account connected at
 * publish time. Passing it to checkout/subscriptions would throw
 * `resource_missing` and permanently break checkout for exactly the
 * longest-standing accounts. Self-heal instead: verify, and mint a fresh
 * customer on the current account when the stored ID is foreign.
 */
export async function ensureCustomerOnCurrentAccount(
  stripe: Stripe,
  user: { id: string; email: string | null; stripeCustomerId: string | null }
): Promise<string> {
  const existingId = user.stripeCustomerId;
  if (existingId) {
    try {
      const existing = await stripe.customers.retrieve(existingId);
      if (!("deleted" in existing && existing.deleted)) return existingId;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "resource_missing") throw err;
      logger.warn(
        { userId: user.id, staleCustomerId: existingId },
        "Stored Stripe customer belongs to a previously connected account — reminting"
      );
    }
  }

  // Idempotency key is stable per (user, stale-id generation): two concurrent
  // requests that both saw the same stale/absent customer converge on ONE new
  // customer at Stripe's layer instead of minting two. The retry wrapper
  // handles `idempotency_key_in_use` when the twin request is still in flight.
  const customer = await withIdempotencyRetry(() =>
    stripe.customers.create(
      {
        email: user.email ?? undefined,
        metadata: { userId: user.id },
      },
      { idempotencyKey: `gk-remint-${user.id}-${existingId ?? "none"}` }
    )
  );

  // Compare-and-swap relink: only claim the row if it still carries the stale
  // value we read. If another request won the race, adopt the winner's ID so
  // every caller proceeds with a single customer (one open-session guard, one
  // subscription check — no double-billing path).
  const claimed = await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id })
    .where(
      and(
        eq(usersTable.id, user.id),
        existingId
          ? eq(usersTable.stripeCustomerId, existingId)
          : isNull(usersTable.stripeCustomerId)
      )
    )
    .returning({ id: usersTable.id });

  if (claimed.length === 0) {
    const [fresh] = await db
      .select({ stripeCustomerId: usersTable.stripeCustomerId })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    if (fresh?.stripeCustomerId) return fresh.stripeCustomerId;
    if (!fresh) {
      // Row vanished (account deleted mid-checkout) — nothing to relink.
      throw new Error(`User ${user.id} no longer exists; cannot link Stripe customer`);
    }
    // Still NULL after the lost race: claim it with a conditional (NULL-only)
    // update, never a blind write — a blind write could overwrite a customer
    // ID another request just claimed. If this CAS also loses, adopt whatever
    // the winner stored.
    const reclaimed = await db
      .update(usersTable)
      .set({ stripeCustomerId: customer.id })
      .where(and(eq(usersTable.id, user.id), isNull(usersTable.stripeCustomerId)))
      .returning({ id: usersTable.id });
    if (reclaimed.length === 0) {
      const [winner] = await db
        .select({ stripeCustomerId: usersTable.stripeCustomerId })
        .from(usersTable)
        .where(eq(usersTable.id, user.id));
      if (winner?.stripeCustomerId) return winner.stripeCustomerId;
    }
  }
  return customer.id;
}
