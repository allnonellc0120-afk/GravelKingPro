import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

async function getStripeCredentials(): Promise<{ secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Missing Replit env vars. Ensure the Stripe integration is connected.');
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) throw new Error(`Failed to fetch Stripe creds: ${resp.status}`);
  const data = await resp.json() as any;
  const secretKey = data.items?.[0]?.settings?.secret_key;
  if (!secretKey) throw new Error('Stripe integration not connected or missing secret key.');
  return { secretKey };
}

async function createProducts() {
  try {
    const { secretKey } = await getStripeCredentials();
    const stripe = new Stripe(secretKey);

    console.log('Checking for existing GravelKing Pro product...');
    const existing = await stripe.products.search({ query: "name:'GravelKing Pro' AND active:'true'" });
    if (existing.data.length > 0) {
      console.log('GravelKing Pro already exists:', existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach(p => console.log(`  Price: $${(p.unit_amount ?? 0) / 100}/${(p.recurring as any)?.interval ?? 'one-time'} — ${p.id}`));
      return;
    }

    console.log('Creating GravelKing Pro product...');
    const proProduct = await stripe.products.create({
      name: 'GravelKing Pro',
      description: 'Full server-side audio processing, unlimited runs, PDF reports, and priority support.',
      metadata: { tier: 'pro' },
    });
    console.log('Created product:', proProduct.id);

    const monthlyPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 3999,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    console.log('Monthly price ($39.99/mo):', monthlyPrice.id);

    console.log('\nCreating Node Auditor product...');
    const auditorProduct = await stripe.products.create({
      name: 'Node Auditor',
      description: 'Enterprise-scale benchmarking, dedicated support, custom reports.',
      metadata: { tier: 'node_auditor' },
    });
    console.log('Created product:', auditorProduct.id);

    const auditorPrice = await stripe.prices.create({
      product: auditorProduct.id,
      unit_amount: 49900,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    console.log('Node Auditor price ($499/mo):', auditorPrice.id);

    console.log('\nAll products created. Webhooks will sync to database automatically.');
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createProducts();
