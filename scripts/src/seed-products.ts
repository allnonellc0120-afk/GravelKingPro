import Stripe from 'stripe';
import { getUncachableStripeClient } from './stripeClient';

async function ensureProduct(stripe: Stripe, name: string, description: string, tier: string) {
  const existing = await stripe.products.search({ query: `name:'${name}' AND active:'true'` });
  if (existing.data.length > 0) {
    console.log(`${name} already exists: ${existing.data[0].id}`);
    return existing.data[0];
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

    // GravelKing Splits — $9.99/month
    const splits = await ensureProduct(
      stripe,
      'GravelKing Splits',
      'Unlimited stem splitting and voice removal with downloadable WAV stems. No Studio access.',
      'splits',
    );
    await ensurePrice(stripe, splits, 999, 'month');

    // GravelKing Pro — $9.99/week  and  $19.99/month (monthly gets 3-day trial in checkout)
    const pro = await ensureProduct(
      stripe,
      'GravelKing Pro',
      'Full server-side audio processing, unlimited runs, plugin chain, waveform studio, and priority support.',
      'pro',
    );
    await ensurePrice(stripe, pro, 999,  'week');
    await ensurePrice(stripe, pro, 1999, 'month');

    // Node Auditor — $499/month
    const auditor = await ensureProduct(
      stripe,
      'Node Auditor',
      'Enterprise-scale benchmarking, dedicated support, custom reports.',
      'node_auditor',
    );
    await ensurePrice(stripe, auditor, 49900, 'month');

    console.log('\nDone. Run the app — Stripe products are ready.');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createProducts();
