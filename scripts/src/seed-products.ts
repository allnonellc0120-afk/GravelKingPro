import Stripe from 'stripe';
import { getUncachableStripeClient } from './stripeClient';

async function ensureProduct(stripe: Stripe, name: string, description: string, tier: string) {
  const existing = await stripe.products.search({ query: `name:'${name}' AND active:'true'` });
  if (existing.data.length > 0) {
    console.log(`${name} already exists: ${existing.data[0].id}`);
    const product = existing.data[0];
    const updates: Stripe.ProductUpdateParams = {};
    if (product.metadata?.tier !== tier) {
      updates.metadata = { ...product.metadata, tier };
    }
    if (product.description !== description) {
      updates.description = description;
    }
    if (Object.keys(updates).length > 0) {
      await stripe.products.update(product.id, updates);
      console.log(`  Updated ${name} catalog metadata/description`);
    }
    return product;
  }
  console.log(`Creating product: ${name}...`);
  const product = await stripe.products.create({ name, description, metadata: { tier } });
  console.log(`  Created product ${product.id}`);
  return product;
}

async function ensurePrice(
  stripe: Stripe,
  product: Stripe.Product,
  unitAmount: number,
  interval: 'week' | 'month' | 'year',
) {
  const prices = await stripe.prices.list({ product: product.id, active: true });

  // Archive any active prices for this interval with the wrong amount (old pricing)
  for (const p of prices.data) {
    if (p.recurring?.interval === interval && p.unit_amount !== unitAmount) {
      await stripe.prices.update(p.id, { active: false });
      console.log(`  Archived old price $${(p.unit_amount ?? 0) / 100}/${interval}: ${p.id}`);
    }
  }

  const match = prices.data.find(
    p => p.recurring?.interval === interval && p.unit_amount === unitAmount,
  );
  if (match) {
    console.log(`  Price $${unitAmount / 100}/${interval} already exists: ${match.id}`);
    return match;
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmount,
    currency: 'usd',
    recurring: { interval },
  });
  console.log(`  Created price $${unitAmount / 100}/${interval}: ${price.id}`);
  return price;
}

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();

    // Pro is the monthly $9.99 plan. Keep the legacy product name so existing
    // Stripe subscribers and entitlement lookups retain their product identity.
    const weekly = await ensureProduct(
      stripe,
      'GravelKing Weekly',
      'Pro access with 800 credits per monthly billing period, Vocal Booth access, free certificates, mastering, and song generation.',
      'pro',
    );
    await ensurePrice(stripe, weekly, 999, 'month');

    // King Pro is the monthly value plan: $24.99/month and 2,500 credits.
    const studio = await ensureProduct(
      stripe,
      'GravelKing Studio',
      'King Pro with 2,500 credits per month, advanced studio features, Vocal Booth, and unlimited free certificates.',
      'king',
    );
    await ensurePrice(stripe, studio, 2499, 'month');

    // Node Auditor — $249.50/month
    const auditor = await ensureProduct(
      stripe,
      'Node Auditor',
      'Enterprise benchmarking at 1T scale, Morris Law V2 access, dedicated support, and custom reports.',
      'node_auditor',
    );
    await ensurePrice(stripe, auditor, 24950, 'month');

    console.log('\nDone. Run the app — Stripe products are ready.');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createProducts();
