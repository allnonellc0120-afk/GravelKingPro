import Stripe from 'stripe';
import { getUncachableStripeClient } from './stripeClient';

async function ensureProduct(stripe: Stripe, name: string, description: string, tier: string) {
  const existing = await stripe.products.search({ query: `name:'${name}' AND active:'true'` });
  if (existing.data.length > 0) {
    console.log(`${name} already exists: ${existing.data[0].id}`);
    const product = existing.data[0];
    if (product.metadata?.tier !== tier) {
      await stripe.products.update(product.id, { metadata: { ...product.metadata, tier } });
      console.log(`  Updated ${name} metadata.tier=${tier}`);
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

    // GravelKing Weekly — $9.99/week
    const weekly = await ensureProduct(
      stripe,
      'GravelKing Weekly',
      'Unlimited 2-stem voice removal and stem splitting with downloadable WAV stems, plus preset mastering (with denoise). No live Studio.',
      'weekly',
    );
    await ensurePrice(stripe, weekly, 999, 'week');

    // GravelKing Studio — $24.99/month
    const studio = await ensureProduct(
      stripe,
      'GravelKing Studio',
      'Everything in Weekly plus fully adjustable mastering and the live DAW — multitrack mixing, recording, and per-stem live metrics.',
      'monthly',
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
