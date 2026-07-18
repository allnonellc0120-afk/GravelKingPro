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

async function migrateAppSchema() {
  try {
    await db.execute(sql`
      ALTER TABLE lyric_projects
        ADD COLUMN IF NOT EXISTS mode              text        NOT NULL DEFAULT 'simple',
        ADD COLUMN IF NOT EXISTS story_prompt      text,
        ADD COLUMN IF NOT EXISTS key               text,
        ADD COLUMN IF NOT EXISTS vocal_type        text,
        ADD COLUMN IF NOT EXISTS genre_tags        text,
        ADD COLUMN IF NOT EXISTS lines_state       jsonb,
        ADD COLUMN IF NOT EXISTS style_prompt      text,
        ADD COLUMN IF NOT EXISTS generation_count  integer     DEFAULT 1,
        ADD COLUMN IF NOT EXISTS is_locked         boolean     DEFAULT false
    `);

    await db.execute(sql`
      ALTER TABLE lyric_revisions
        ADD COLUMN IF NOT EXISTS edit_type          text,
        ADD COLUMN IF NOT EXISTS line_index         integer,
        ADD COLUMN IF NOT EXISTS original_line_text text,
        ADD COLUMN IF NOT EXISTS regen_instruction  text
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lyric_timeline_blocks (
        id             text        PRIMARY KEY,
        project_id     text        NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
        timestamp_ms   integer     NOT NULL DEFAULT 0,
        label          text        NOT NULL,
        section_type   text,
        sort_order     integer     NOT NULL DEFAULT 0,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lyric_forensic_ledger (
        id                       text        PRIMARY KEY,
        project_id               text        NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
        session_id               text,
        edit_type                text        NOT NULL,
        line_index               integer,
        original_text            text,
        new_text                 text,
        regen_instruction        text,
        levenshtein_delta        integer,
        authorship_score_before  integer,
        authorship_score_after   integer,
        created_at               timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ip_cert_stubs (
        cert_id               text        PRIMARY KEY,
        denominator           text        NOT NULL,
        handshake             text        NOT NULL,
        content_hash          text        NOT NULL,
        artist                text        NOT NULL,
        certified_at          timestamptz NOT NULL DEFAULT now(),
        style_prompt          text,
        style_authorship_score integer
      )
    `);

    logger.info("App schema migration complete");
  } catch (err: unknown) {
    logger.error({ err }, "App schema migration failed — continuing anyway");
  }
}

await migrateAppSchema();
await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
