/**
 * Integration test: paid track-order webhook correctly records a purchase.
 *
 * Guards two fixes:
 *
 *   1. getStripeSync() no longer passes stripeWebhookSecret from the env / connector
 *      (which would bypass the DB lookup and fail with stale secrets).
 *      stripe-replit-sync always reads the secret from stripe._managed_webhooks.
 *
 *   2. WebhookHandlers.processWebhook accepts an injectable SecretsLoader so tests
 *      can supply a known signing secret without depending on the live DB state of
 *      stripe._managed_webhooks (which has a FK constraint that blocks test rows).
 *
 * Scenarios:
 *   A) checkout.session.completed with track_id + user_id → purchased_tracks row inserted
 *   B) Replay of same event is idempotent (onConflictDoNothing, no duplicate row)
 *   C) Wrong-secret event does NOT insert a purchased_tracks row
 *   D) getStripeSync() passes no stripeWebhookSecret to the StripeSync constructor
 */

import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { WebhookHandlers, type SecretsLoader } from "../webhookHandlers";
import { getStripeSync } from "../stripeClient";
import {
  db,
  usersTable,
} from "@workspace/db";

// ── Tiny assertion harness (matches the other tests in this suite) ────────────
let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Stripe signature helpers ──────────────────────────────────────────────────

/**
 * Construct a valid Stripe webhook signature header using raw crypto.
 * Mirrors stripe.webhooks.generateTestHeaderString without requiring the SDK.
 *   format: t=<unix>,v1=<HMAC-SHA256(<t>.<payload>, secret)>
 */
function makeStripeSignature(payload: string, secret: string, ts?: number): string {
  const timestamp = ts ?? Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** Build a minimal checkout.session.completed event JSON string. */
function makeCheckoutSessionEvent(opts: {
  sessionId: string;
  userId: string;
  trackId: string;
  mode?: "payment" | "subscription";
}): string {
  return JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        payment_status: "paid",
        status: "complete",
        mode: opts.mode ?? "payment",
        client_reference_id: null,
        metadata: {
          user_id: opts.userId,
          track_id: opts.trackId,
        },
      },
    },
  });
}

/** Build a minimal payment_intent.succeeded event JSON string (embedded checkout flow). */
function makePaymentIntentEvent(opts: {
  intentId: string;
  userId: string;
  trackId: string;
}): string {
  return JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.intentId,
        object: "payment_intent",
        status: "succeeded",
        metadata: {
          type: "track",
          user_id: opts.userId,
          track_id: opts.trackId,
        },
      },
    },
  });
}

// ── Test IDs (isolated to this run) ──────────────────────────────────────────
const TEST_USER_ID = `wh_test_user_${randomUUID()}`;
const TEST_TRACK_ID = randomUUID();
const TEST_SESSION_ID = `cs_test_wh_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
// Known test signing secret — used to sign payloads and injected via SecretsLoader.
const TEST_SECRET = `whsec_test_${randomUUID().replace(/-/g, "")}`;

/** Inject the test secret so WebhookHandlers does not query stripe._managed_webhooks. */
const testSecretsLoader: SecretsLoader = async () => [TEST_SECRET];
/** Empty loader simulates a missing managed-webhook row. */
const emptySecretsLoader: SecretsLoader = async () => [];

// ── DB setup + teardown ───────────────────────────────────────────────────────

async function setup(): Promise<void> {
  // Test user (FK target for purchased_tracks.user_id)
  await db.insert(usersTable).values({ id: TEST_USER_ID }).onConflictDoNothing();

  // Test track (FK target for purchased_tracks.track_id)
  await db.execute(sql`
    INSERT INTO tracks
      (id, title, artist_name, audio_full_key, audio_preview_key,
       cover_art_key, price, status)
    VALUES (
      ${TEST_TRACK_ID}::uuid,
      'Webhook Test Track',
      'Test Artist',
      'audio/full/wh-test.wav',
      'audio/preview/wh-test.wav',
      'covers/wh-test.jpg',
      4.99,
      'accepted'
    )
    ON CONFLICT (id) DO NOTHING
  `);
}

async function teardown(): Promise<void> {
  await db.execute(sql`
    DELETE FROM purchased_tracks
    WHERE user_id = ${TEST_USER_ID}
      AND track_id = ${TEST_TRACK_ID}::uuid
  `);
  await db.execute(sql`DELETE FROM tracks WHERE id = ${TEST_TRACK_ID}::uuid`);
  await db.execute(sql`DELETE FROM users WHERE id = ${TEST_USER_ID}`);
}

// ── Scenario A + B: track purchase + idempotency ──────────────────────────────

async function testTrackPurchase(): Promise<void> {
  console.log("\nWebhook A: track purchase is recorded using the managed signing secret");

  await setup();
  try {
    const payload = makeCheckoutSessionEvent({
      sessionId: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      trackId: TEST_TRACK_ID,
    });
    const payloadBuf = Buffer.from(payload, "utf8");
    const signature = makeStripeSignature(payload, TEST_SECRET);

    // A1. processWebhook must succeed (no StripeSignatureVerificationError)
    let threw = false;
    let thrownMsg = "";
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch (err) {
      threw = true;
      thrownMsg = err instanceof Error ? err.message : String(err);
    }

    check(
      "A1. processWebhook resolves without error (injected managed secret accepted)",
      !threw,
      threw ? thrownMsg : "",
    );

    // A2. purchased_tracks row inserted
    const rows = await db.execute(sql`
      SELECT stripe_checkout_session_id
      FROM purchased_tracks
      WHERE user_id = ${TEST_USER_ID}
        AND track_id = ${TEST_TRACK_ID}::uuid
    `);
    const inserted = rows.rows as Array<Record<string, unknown>>;
    check("A2. purchased_tracks row inserted", inserted.length === 1, `found ${inserted.length}`);
    check(
      "A3. stripe_checkout_session_id matches event session",
      inserted[0]?.stripe_checkout_session_id === TEST_SESSION_ID,
      `got: ${inserted[0]?.stripe_checkout_session_id}`,
    );

    // B. Idempotency: replay the identical event
    console.log("\nWebhook B: replay is idempotent (onConflictDoNothing)");
    let replayThrew = false;
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch {
      replayThrew = true;
    }
    const afterReplay = await db.execute(sql`
      SELECT id FROM purchased_tracks
      WHERE user_id = ${TEST_USER_ID} AND track_id = ${TEST_TRACK_ID}::uuid
    `);
    check("B1. replay does not throw", !replayThrew);
    check(
      "B2. replay does not create a duplicate row",
      (afterReplay.rows as unknown[]).length === 1,
      `found ${(afterReplay.rows as unknown[]).length}`,
    );
  } finally {
    await teardown();
  }
}

// ── Scenario C: wrong-secret event is rejected ────────────────────────────────

async function testWrongSecret(): Promise<void> {
  console.log("\nWebhook C: wrong-secret event does NOT insert a purchased_tracks row");

  const otherUser = `wh_test_user3_${randomUUID()}`;
  await db.insert(usersTable).values({ id: otherUser }).onConflictDoNothing();
  // Insert track for the FK reference (reuse TEST_TRACK_ID; track may already be gone
  // from prior teardown, so we guard with ON CONFLICT DO NOTHING).
  await db.execute(sql`
    INSERT INTO tracks
      (id, title, artist_name, audio_full_key, audio_preview_key,
       cover_art_key, price, status)
    VALUES (
      ${TEST_TRACK_ID}::uuid,
      'Webhook Test Track C',
      'Test Artist',
      'audio/full/wh-test-c.wav',
      'audio/preview/wh-test-c.wav',
      'covers/wh-test-c.jpg',
      4.99,
      'accepted'
    )
    ON CONFLICT (id) DO NOTHING
  `);

  try {
    const cSession = `cs_test_c_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const payload = makeCheckoutSessionEvent({
      sessionId: cSession,
      userId: otherUser,
      trackId: TEST_TRACK_ID,
    });
    const payloadBuf = Buffer.from(payload, "utf8");

    const wrongSecret = `whsec_wrong_${randomUUID().replace(/-/g, "")}`;
    const badSig = makeStripeSignature(payload, wrongSecret);

    // With the wrong secret, the injected loader still provides [TEST_SECRET].
    // constructEvent will fail (bad sig), event stays null, handler falls through to
    // sync.processWebhook. sync also fails (no managed secret in _managed_webhooks for this
    // signature). Either way, NO purchased_tracks row should be inserted.
    try {
      await WebhookHandlers.processWebhook(payloadBuf, badSig, undefined, testSecretsLoader);
    } catch {
      // Expected — sync.processWebhook will also reject the bad signature.
    }

    const wrongRows = await db.execute(sql`
      SELECT id FROM purchased_tracks
      WHERE user_id = ${otherUser} AND track_id = ${TEST_TRACK_ID}::uuid
    `);
    check(
      "C1. wrong-secret event does NOT insert a purchased_tracks row",
      (wrongRows.rows as unknown[]).length === 0,
      `found ${(wrongRows.rows as unknown[]).length} rows`,
    );
  } finally {
    await db.execute(sql`
      DELETE FROM purchased_tracks
      WHERE user_id = ${otherUser} AND track_id = ${TEST_TRACK_ID}::uuid
    `);
    await db.execute(sql`DELETE FROM tracks WHERE id = ${TEST_TRACK_ID}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id = ${otherUser}`);
  }
}

// ── Scenario D: getStripeSync() omits stripeWebhookSecret ────────────────────

async function testStripeSyncOmitsWebhookSecret(): Promise<void> {
  console.log(
    "\nWebhook D: getStripeSync() does not pass stripeWebhookSecret to StripeSync constructor",
  );

  // Inspect the StripeSync instance's config. stripe-replit-sync stores the
  // config as `this.config`. We access it via Object.getOwnPropertyDescriptor
  // rather than a typed property to stay resilient to library internals.
  const sync = await getStripeSync();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = (sync as unknown as Record<string, any>).config as Record<string, unknown> | undefined;
  const webhookSecretInConfig = config?.stripeWebhookSecret ?? config?.webhookSecret;

  check(
    "D1. StripeSync config has no stripeWebhookSecret (will always use DB lookup)",
    !webhookSecretInConfig,
    webhookSecretInConfig
      ? `got a non-empty secret: ${String(webhookSecretInConfig).slice(0, 10)}…`
      : "",
  );
}

// ── Scenario E: embedded PaymentIntent purchase is recorded ──────────────────

async function testPaymentIntentPurchase(): Promise<void> {
  console.log("\nWebhook E: payment_intent.succeeded (embedded checkout) records the purchase");

  await setup();
  try {
    const piId = `pi_test_wh_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const payload = makePaymentIntentEvent({
      intentId: piId,
      userId: TEST_USER_ID,
      trackId: TEST_TRACK_ID,
    });
    const payloadBuf = Buffer.from(payload, "utf8");
    const signature = makeStripeSignature(payload, TEST_SECRET);

    let threw = false;
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch {
      threw = true;
    }
    check("E1. processWebhook resolves without error", !threw);

    const rows = await db.execute(sql`
      SELECT stripe_checkout_session_id FROM purchased_tracks
      WHERE user_id = ${TEST_USER_ID} AND track_id = ${TEST_TRACK_ID}::uuid
    `);
    const inserted = rows.rows as Array<Record<string, unknown>>;
    check("E2. purchased_tracks row inserted for the payment intent", inserted.length === 1, `found ${inserted.length}`);
    check(
      "E3. stored reference is the payment intent id",
      inserted[0]?.stripe_checkout_session_id === piId,
      `got: ${inserted[0]?.stripe_checkout_session_id}`,
    );

    // Idempotent replay
    await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader).catch(() => {});
    const afterReplay = await db.execute(sql`
      SELECT id FROM purchased_tracks
      WHERE user_id = ${TEST_USER_ID} AND track_id = ${TEST_TRACK_ID}::uuid
    `);
    check("E4. replay does not create a duplicate row", (afterReplay.rows as unknown[]).length === 1);
  } finally {
    await teardown();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await testTrackPurchase();
  await testPaymentIntentPurchase();
  await testWrongSecret();
  await testStripeSyncOmitsWebhookSecret();

  console.log(`\nResults: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
