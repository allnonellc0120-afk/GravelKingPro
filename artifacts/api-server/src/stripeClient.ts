import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  // Replit's managed Stripe connection is authoritative. It selects the matching
  // sandbox/live credentials for the environment and lets Stripe's deployment
  // checks verify that production is wired to a live account.
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
        const data = await resp.json() as {
          items?: Array<{
            settings?: {
              secret_key?: string;
              secret?: string;
              webhook_secret?: string;
            };
          }>;
        };
        const settings = data.items?.[0]?.settings;
        // The connector schema has shipped the secret under both `secret_key`
        // and (currently) `secret`; accept either, but never a publishable key.
        const managedKey = settings?.secret_key ?? settings?.secret;
        if (
          managedKey &&
          !managedKey.startsWith("pk_live_") &&
          !managedKey.startsWith("pk_test_")
        ) {
          return {
            secretKey: managedKey,
            webhookSecret: settings?.webhook_secret,
          };
        }
      }
    } catch (err) {
      console.warn("[stripe] Managed connection lookup failed", err);
    }
  }

  throw new Error(
    'Stripe managed connection is unavailable. Reconnect the Stripe integration ' +
    'before publishing so production can use verified live credentials.'
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
