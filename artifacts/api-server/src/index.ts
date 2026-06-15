import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
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
    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    const webhookUrl = `${webhookBaseUrl}/api/stripe/webhook`;
    logger.info({ url: webhookUrl }, "Setting up managed webhook...");
    await stripeSync.findOrCreateManagedWebhook(webhookUrl);
    logger.info("Webhook configured");

    logger.info("Starting Stripe data backfill (runs in background)...");
    stripeSync.syncBackfill()
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
