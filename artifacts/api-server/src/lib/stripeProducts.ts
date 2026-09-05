import type Stripe from "stripe";
import { logger } from "./logger";
import { getUncachableStripeClient } from "../stripeClient";
import { withIdempotencyRetry } from "./stripeIdempotency";

/**
 * Self-seeding product catalog.
 *
 * Production connects to the live Stripe account only at publish time (the
 * Stripe step in Replit's publishing flow). A freshly connected live account
 * has no products, which would leave /pricing empty and checkout broken until
 * someone manually ran the seed script. To make going live zero-touch, the
 * server ensures the catalog exists at every boot — idempotently:
 *
 *  - product lookup is by exact name (same rule as scripts/src/seed-products.ts)
 *  - prices with the right interval+amount are reused, wrong-amount prices for
 *    the same interval are archived (old pricing), nothing is ever deleted
 *  - on the sandbox/dev account everything already exists, so this is a no-op
 *
 * Keep this catalog in sync with scripts/src/seed-products.ts (manual runner).
 */
const CATALOG: Array<{
  name: string;
  description: string;
  tier: string;
  unitAmount: number;
  interval: "week" | "month";
}> = [
  {
    name: "GravelKing Weekly",
    description:
      "Pro access to mastering and converter, with unlimited MP3 exports and 10 WAV exports per rolling 7 days.",
    tier: "pro",
    unitAmount: 999,
    interval: "month",
  },
  {
    name: "GravelKing Studio",
    description:
      "Everything in Pro plus King access, 40 WAV exports per rolling 30 days, and unlimited included certificate unlocks.",
    tier: "king",
    unitAmount: 2499,
    interval: "month",
  },
  {
    name: "Node Auditor",
    description:
      "Enterprise benchmarking at 1T scale, Morris Law V2 access, dedicated support, and custom reports.",
    tier: "node_auditor",
    unitAmount: 24950,
    interval: "month",
  },
];

async function ensureProduct(
  stripe: Stripe,
  item: (typeof CATALOG)[number]
): Promise<{ product: Stripe.Product; created: boolean }> {
  const existing = await stripe.products.search({
    query: `name:'${item.name}' AND active:'true'`,
  });
  if (existing.data.length > 0) {
    // Deterministic pick if duplicates ever exist: oldest wins everywhere.
    // `created` has second precision, so break ties on the object ID — a
    // stable total order that every concurrent boot resolves identically.
    const product = [...existing.data].sort(
      (a, b) => a.created - b.created || a.id.localeCompare(b.id)
    )[0];
    if (product.metadata?.tier !== item.tier) {
      await stripe.products.update(product.id, {
        metadata: { ...product.metadata, tier: item.tier },
      });
    }
    return { product, created: false };
  }
  // Deterministic idempotency key: concurrent boots (multiple publish
  // instances starting against a fresh live account) converge on ONE product
  // at Stripe's layer instead of each creating their own. The retry wrapper
  // handles `idempotency_key_in_use` (another boot's identical request still
  // in flight) — after backoff Stripe returns the stored response.
  const product = await withIdempotencyRetry(() =>
    stripe.products.create(
      {
        name: item.name,
        description: item.description,
        metadata: { tier: item.tier },
      },
      { idempotencyKey: `gk-seed-product-${item.tier}` }
    )
  );
  return { product, created: true };
}

async function ensurePrice(
  stripe: Stripe,
  product: Stripe.Product,
  unitAmount: number,
  interval: "week" | "month"
): Promise<{ price: Stripe.Price; created: boolean }> {
  // Paginate fully — deciding "no valid price exists" from a partial page
  // could mint a duplicate when the canonical price sits on page two.
  const prices = { data: [] as Stripe.Price[] };
  for await (const p of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
    prices.data.push(p);
  }

  // Archive active USD prices for this interval carrying the wrong amount
  // (stale pricing). Only USD is ours to manage — the catalog is USD-only.
  for (const p of prices.data) {
    if (
      p.recurring?.interval === interval &&
      p.currency === "usd" &&
      p.unit_amount !== unitAmount
    ) {
      await stripe.prices.update(p.id, { active: false });
      logger.warn(
        { product: product.name, priceId: p.id, amount: p.unit_amount },
        "Archived stale Stripe price"
      );
    }
  }

  // Reuse requires the full identity: interval AND amount AND USD — a
  // same-amount foreign-currency price must never become the canonical one.
  // Tie-break same-second `created` values on the object ID for a stable
  // total order (concurrent boots must all pick the same canonical price).
  const match = [...prices.data]
    .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
    .find(
      (p) =>
        p.recurring?.interval === interval &&
        p.currency === "usd" &&
        p.unit_amount === unitAmount
    );
  if (match) return { price: match, created: false };

  const price = await withIdempotencyRetry(() =>
    stripe.prices.create(
      {
        product: product.id,
        unit_amount: unitAmount,
        currency: "usd",
        recurring: { interval },
      },
      // Concurrent boots converge on one price object at Stripe's layer.
      { idempotencyKey: `gk-seed-price-${product.id}-${interval}-${unitAmount}` }
    )
  );
  return { price, created: true };
}

/**
 * Ensure the subscription products (and their prices) exist on whatever
 * Stripe account the managed connection currently points at. Safe to run on
 * every boot; only creates what is missing.
 */
export async function ensureStripeProducts(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  let createdAnything = false;

  for (const item of CATALOG) {
    const { product, created } = await ensureProduct(stripe, item);
    const { price, created: priceCreated } = await ensurePrice(
      stripe,
      product,
      item.unitAmount,
      item.interval
    );
    if (created || priceCreated) {
      createdAnything = true;
      logger.info(
        {
          product: product.name,
          productId: product.id,
          priceId: price.id,
          amount: item.unitAmount,
          interval: item.interval,
        },
        "Stripe product self-seeded"
      );
    }
  }

  if (!createdAnything) {
    logger.info("Stripe product catalog verified (all products present)");
  }
}
