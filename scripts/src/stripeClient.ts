import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  // Fast path: env var secret key (set when Replit integration is not used).
  // Publishable keys (pk_*) cannot make server-side calls — ignore them so we
  // fall through to the managed-connection lookup instead of failing later.
  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) {
    if (envKey.startsWith("pk_")) {
      console.warn("[stripe] STRIPE_SECRET_KEY is a publishable key (pk_*); ignoring it and trying the managed connection.");
    } else {
      return {
        secretKey: envKey,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      };
    }
  }

  // Replit integration path
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (hostname && xReplitToken) {
    try {
      const resp = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
        {
          headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (resp.ok) {
        const data = await resp.json() as { items?: Array<{ settings?: { secret_key?: string; secret?: string; webhook_secret?: string } }> };
        const settings = data.items?.[0]?.settings;
        // The connector has shipped the secret under both `secret_key` and
        // (currently) `secret`; accept either.
        const managedKey = settings?.secret_key ?? settings?.secret;
        if (managedKey && !managedKey.startsWith("pk_")) {
          return {
            secretKey: managedKey,
            webhookSecret: settings?.webhook_secret,
          };
        }
      }
    } catch {
      // Fall through to error below
    }
  }

  throw new Error(
    'Stripe not configured. Either connect Stripe via the Integrations tab, ' +
    'or set the STRIPE_SECRET_KEY environment secret.'
  );
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? '',
  });
}
