import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { ensureStripeProducts } from "./lib/stripeProducts";
import { submitSitemapToGSC } from "./lib/googleSearchConsole";
import { scheduleOverdueAlerts } from "./lib/investorAlerts";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { DEMO_EMAIL, DEMO_PASSWORD_HASH, DEMO_USER_ID } from "./lib/auth";

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

    // Self-seed the product catalog BEFORE the backfill so a freshly connected
    // live account (publish-time Stripe step) mirrors complete products/prices.
    try {
      await ensureStripeProducts();
    } catch (err: unknown) {
      logger.error({ err }, "Stripe product self-seed failed");
    }

    logger.info("Starting Stripe data backfill (runs in background)...");
    const stripeSync = await getStripeSync();
    stripeSync
      // Passing no argument makes syncBackfill a silent no-op in this library
      // version (the object selector falls through the switch). "all" performs
      // the real product/price/customer/subscription backfill.
      .syncBackfill({ object: "all" })
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err: unknown) => {
        // Known benign case: the local mirror still carries customer IDs
        // minted on a previously connected Stripe account (dev sandbox before
        // the live account was attached). Listing payment methods for those
        // throws resource_missing. Checkout self-heals such customers via
        // ensureCustomerOnCurrentAccount, so log this quietly instead of as
        // an ERROR that buries real backfill failures.
        const e = err as { code?: string; param?: string };
        if (e?.code === "resource_missing" && e?.param === "customer") {
          logger.warn(
            { err },
            "Stripe backfill skipped stale mirrored customer(s) from a previously connected account — checkout self-heals these"
          );
          return;
        }
        logger.error({ err }, "Stripe backfill error");
      });
  } catch (err: unknown) {
    logger.error({ err }, "Failed to set up Stripe webhook/backfill");
  }
}

async function migrateAppSchema() {
  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_hash text
    `);
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

    // Generated tracks now persist the sung lyrics for the library player
    // (owner-only exposure). Additive + idempotent so databases created
    // before this column upgrade safely on startup.
    await db.execute(sql`
      ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS lyrics_text text
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

    // Certificate paywall — docs stay private until unlocked (additive + idempotent).
    await db.execute(sql`
      ALTER TABLE ip_cert_stubs
        ADD COLUMN IF NOT EXISTS ipi_number        text,
        ADD COLUMN IF NOT EXISTS iswc              text,
        ADD COLUMN IF NOT EXISTS isrc              text,
        ADD COLUMN IF NOT EXISTS owner_user_id     text,
        ADD COLUMN IF NOT EXISTS category          text,
        ADD COLUMN IF NOT EXISTS provenance        text,
        ADD COLUMN IF NOT EXISTS unlocked_at       timestamptz,
        ADD COLUMN IF NOT EXISTS unlock_source     text,
        ADD COLUMN IF NOT EXISTS stripe_session_id text
    `);
    // Provenance attribution on the certificate document — the generating AI
    // model and the commercial-catalog copyright-screen result (additive +
    // idempotent; NULL on legacy stubs → fields omitted from the document).
    await db.execute(sql`
      ALTER TABLE ip_cert_stubs
        ADD COLUMN IF NOT EXISTS generation_model       text,
        ADD COLUMN IF NOT EXISTS fingerprint_status     text,
        ADD COLUMN IF NOT EXISTS fingerprint_provider   text,
        ADD COLUMN IF NOT EXISTS fingerprint_scanned_at timestamptz
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS cert_unlocks             integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cert_unlock_period_start timestamptz
    `);

    // Investor outreach tracker (admin-only).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS investor_prospects (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        sort_order  integer     NOT NULL DEFAULT 0,
        name        text        NOT NULL,
        route       text,
        notes       text,
        status      text        NOT NULL DEFAULT 'not_started',
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    // sort_order is the seed identity — unique constraint lets onConflictDoNothing
    // prevent duplicate prospect sets from concurrent first-load requests.
    // Use a DO block because ADD CONSTRAINT IF NOT EXISTS is not standard SQL.
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'investor_prospects_sort_order_uniq'
        ) THEN
          ALTER TABLE investor_prospects
            ADD CONSTRAINT investor_prospects_sort_order_uniq UNIQUE (sort_order);
        END IF;
      END $$
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS investor_touches (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        prospect_id  uuid        NOT NULL REFERENCES investor_prospects(id) ON DELETE CASCADE,
        touch_number integer     NOT NULL,
        sent_at      date,
        response     text,
        notes        text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        UNIQUE (prospect_id, touch_number)
      )
    `);

    logger.info("App schema migration complete");
  } catch (err: unknown) {
    logger.error({ err }, "App schema migration failed — continuing anyway");
  }
}

async function ensureDemoAccount() {
  await db
    .insert(usersTable)
    .values({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      passwordHash: DEMO_PASSWORD_HASH,
      firstName: "Google Play",
      lastName: "Reviewer",
      isPro: true,
      subscriptionTier: "node_auditor",
      isDeveloper: false,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email: DEMO_EMAIL,
        passwordHash: DEMO_PASSWORD_HASH,
        firstName: "Google Play",
        lastName: "Reviewer",
        isPro: true,
        subscriptionTier: "node_auditor",
        isDeveloper: false,
        updatedAt: new Date(),
      },
    });
  logger.info("Play reviewer demo account ready");
}

/**
 * Submits the sitemap to Google Search Console on startup (production only).
 *
 * A lightweight DB table tracks the last successful submission so we only
 * ping GSC once per 24 hours, not on every container restart.
 * All errors are logged and swallowed — this must never block startup.
 */
async function submitSitemapOnStartup(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  try {
    // Ensure the tracking table exists (idempotent).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sitemap_submission_log (
        key          text        PRIMARY KEY,
        submitted_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Check whether a submission already happened in the last 24 hours.
    const rows = await db.execute(sql`
      SELECT submitted_at
      FROM   sitemap_submission_log
      WHERE  key = 'gsc'
    `);

    const lastSubmitted = rows.rows[0]?.submitted_at as Date | undefined;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (lastSubmitted && new Date(lastSubmitted) > cutoff) {
      logger.info({ lastSubmitted }, "GSC sitemap already submitted within 24 h — skipping");
      return;
    }

    logger.info("Submitting sitemap to Google Search Console...");
    const result = await submitSitemapToGSC();

    if (result.ok) {
      await db.execute(sql`
        INSERT INTO sitemap_submission_log (key, submitted_at)
        VALUES ('gsc', now())
        ON CONFLICT (key) DO UPDATE SET submitted_at = now()
      `);
      logger.info(
        { siteAdded: result.siteAdded, serviceAccountEmail: result.serviceAccountEmail },
        "Sitemap submitted to GSC successfully",
      );
    } else {
      logger.error({ error: result.error }, "GSC sitemap submission failed");
    }
  } catch (err: unknown) {
    logger.error({ err }, "GSC sitemap startup submission error — continuing");
  }
}

await migrateAppSchema();
await ensureDemoAccount();
await initStripe();
await submitSitemapOnStartup();
scheduleOverdueAlerts();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
