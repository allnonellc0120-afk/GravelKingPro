import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set. Add it to your Replit Secrets.');
  process.exit(1);
}

const stripe = new Stripe(key);

async function createProducts() {
  try {
    console.log('Checking for existing GravelKing Pro product...');
    const existing = await stripe.products.search({ query: "name:'GravelKing Pro' AND active:'true'" });
    if (existing.data.length > 0) {
      console.log('GravelKing Pro already exists:', existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach(p => console.log(`  Price: $${(p.unit_amount ?? 0) / 100}/${(p.recurring as any)?.interval ?? 'one-time'} — ${p.id}`));
    } else {
      console.log('Creating GravelKing Pro...');
      const proProduct = await stripe.products.create({
        name: 'GravelKing Pro',
        description: 'Full server-side audio processing, unlimited runs, PDF reports, and priority support.',
        metadata: { tier: 'pro' },
      });
      const monthlyPrice = await stripe.prices.create({
        product: proProduct.id,
        unit_amount: 3999,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      console.log(`Created GravelKing Pro — monthly price: $39.99/mo (${monthlyPrice.id})`);
    }

    console.log('\nChecking for Node Auditor product...');
    const existingAuditor = await stripe.products.search({ query: "name:'Node Auditor' AND active:'true'" });
    if (existingAuditor.data.length > 0) {
      console.log('Node Auditor already exists:', existingAuditor.data[0].id);
    } else {
      console.log('Creating Node Auditor...');
      const auditorProduct = await stripe.products.create({
        name: 'Node Auditor',
        description: 'Enterprise-scale benchmarking, dedicated support, custom reports.',
        metadata: { tier: 'node_auditor' },
      });
      const auditorPrice = await stripe.prices.create({
        product: auditorProduct.id,
        unit_amount: 49900,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      console.log(`Created Node Auditor — price: $499/mo (${auditorPrice.id})`);
    }

    console.log('\nDone. Webhooks will sync products to your database automatically.');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createProducts();
