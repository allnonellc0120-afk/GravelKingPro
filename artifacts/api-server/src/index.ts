import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Sets up the Stripe managed webhook, with automatic self-healing.
 *
 * stripe-replit-sync stores the Stripe webhook endpoint ID in
 * stripe._managed_webhooks.  If that endpoint is later deleted from the
 * Stripe dashboard (or after a re-publish pointing to a new domain), the
 * stored ID becomes stale and findOrCreateManagedWebhook throws
 * StripeInvalidRequestError code=resource_missing.
 *
 * When that happens we delete the stale DB row and retry once, so the server
 * always comes up with a valid, live webhook — no manual intervention required.
 */
async function setupWebhook(webhookUrl: string): Promise<void> {
  const stripeSync = await getStripeSync();

  try {
    await stripeSync.findOrCreateManagedWebhook(webhookUrl);
    logger.info({ url: webhookUrl }, "Webhook configured");
  } catch (err: unknown) {
    const isResourceMissing =
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "resource_missing";

    if (!isResourceMissing) throw err;

    // The stored webhook endpoint no longer exists in Stripe.
    // Wipe the stale row so findOrCreateManagedWebhook creates a fresh one.
    logger.warn(
      { url: webhookUrl },
      "Stale webhook endpoint detected — clearing and recreating automatically"
    );

    await db.execute(
      sql`DELETE FROM stripe._managed_webhooks WHERE url = ${webhookUrl}`
    );

    // Retry — this time findOrCreateManagedWebhook will INSERT a fresh record.
    await stripeSync.findOrCreateManagedWebhook(webhookUrl);
    logger.info({ url: webhookUrl }, "Webhook recreated successfully");
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe initialization");
    return;
  }

  try {
    logger.info("Running Stripe schema migrations...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");
  } catch (err: unknown) {
    logger.error({ err }, "Stripe migrations failed");
    return;
  }

  try {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
    const webhookUrl = `https://${domain}/api/stripe/webhook`;
    logger.info({ url: webhookUrl }, "Setting up managed webhook...");
    await setupWebhook(webhookUrl);

    logger.info("Starting Stripe data backfill (runs in background)...");
    const stripeSync = await getStripeSync();
    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err: unknown) => logger.error({ err }, "Stripe backfill error"));
  } catch (err: unknown) {
    logger.error({ err }, "Failed to set up Stripe webhook/backfill");
  }
}

await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
