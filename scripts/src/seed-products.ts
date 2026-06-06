import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set. Add it to your Replit Secrets.');
  process.exit(1);
}

const stripe = new Stripe(key);

async function ensureProduct(name: string, description: string, tier: string, unitAmount: number, interval: 'month' | 'year' = 'month') {
  const existing = await stripe.products.search({ query: `name:'${name}' AND active:'true'` });
  if (existing.data.length > 0) {
    console.log(`${name} already exists: ${existing.data[0].id}`);
    const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
    prices.data.forEach(p => console.log(`  Price: $${(p.unit_amount ?? 0) / 100}/${(p.recurring as any)?.interval ?? 'one-time'} — ${p.id}`));
  } else {
    console.log(`Creating ${name}...`);
    const product = await stripe.products.create({
      name,
      description,
      metadata: { tier },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: unitAmount,
      currency: 'usd',
      recurring: { interval },
    });
    console.log(`Created ${name} — price: $${unitAmount / 100}/mo (${price.id})`);
  }
}

async function createProducts() {
  try {
    await ensureProduct(
      'GravelKing Splits',
      'Unlimited stem splitting and voice removal with downloadable WAV stems. No Studio access.',
      'splits',
      999,
    );

    await ensureProduct(
      'GravelKing Pro',
      'Full server-side audio processing, unlimited runs, PDF reports, and priority support.',
      'pro',
      3999,
    );

    await ensureProduct(
      'Node Auditor',
      'Enterprise-scale benchmarking, dedicated support, custom reports.',
      'node_auditor',
      49900,
    );

    console.log('\nDone. Webhooks will sync products to your database automatically.');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createProducts();
