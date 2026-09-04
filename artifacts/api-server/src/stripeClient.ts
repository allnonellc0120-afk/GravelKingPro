import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey?: string; webhookSecret?: string }> {
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
              publishable_key?: string;
              publishableKey?: string;
              webhook_secret?: string;
              [key: string]: unknown;
            };
          }>;
        };
        const settings = data.items?.[0]?.settings;
        const discoveredPublishableKey = settings
          ? Object.values(settings).find(
              (value): value is string => typeof value === "string" && /^pk_(test|live)_/.test(value),
            )
          : undefined;
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
            publishableKey: settings?.publishable_key ?? settings?.publishableKey ?? discoveredPublishableKey,
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

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getStripeCredentials();
  if (!publishableKey) throw new Error("Stripe publishable key is unavailable.");
  return publishableKey;
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { secretKey } = await getStripeCredentials();
  // Intentionally omit stripeWebhookSecret so stripe-replit-sync always reads
  // the signing secret from stripe._managed_webhooks on every processWebhook call.
  // Passing a secret here (even from the connector or STRIPE_WEBHOOK_SECRET env var)
  // would bypass that DB lookup and cause StripeSignatureVerificationError whenever
  // the env-var value is stale or absent — which is the normal state once
  // findOrCreateManagedWebhook has taken ownership of the endpoint.
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
  });
}
