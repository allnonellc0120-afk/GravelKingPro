/**
 * Integration test: $1.99 per-certificate unlock via Stripe webhook.
 *
 * Scenarios:
 *   A) checkout.session.completed with kind=cert_unlock, valid payment
 *      → ip_cert_stubs row gets unlockedAt, unlockSource='purchase', stripeSessionId set
 *   B) Replay of the same event (Stripe retry / duplicate delivery)
 *      → no error, no change to the row (idempotent WHERE unlockedAt IS NULL)
 *   C) Wrong-secret event
 *      → ip_cert_stubs row remains locked
 *   D) Webhook for a cert owned by a different user
 *      → does NOT unlock the target cert (owner-scoped WHERE clause)
 *   E) Already-unlocked cert replayed
 *      → row unchanged (second replay after a successful unlock is still a no-op)
 */

import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { WebhookHandlers, type SecretsLoader } from "../webhookHandlers";
import { db, usersTable, ipCertStubsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Assertion harness ─────────────────────────────────────────────────────────

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

function makeStripeSignature(payload: string, secret: string, ts?: number): string {
  const timestamp = ts ?? Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

function makeCertUnlockEvent(opts: {
  sessionId: string;
  userId: string;
  certId: string;
  paymentStatus?: string;
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
        payment_status: opts.paymentStatus ?? "paid",
        status: "complete",
        mode: "payment",
        client_reference_id: opts.userId,
        metadata: {
          kind: "cert_unlock",
          cert_id: opts.certId,
          user_id: opts.userId,
        },
      },
    },
  });
}

// ── Test constants ────────────────────────────────────────────────────────────

const TEST_USER_ID   = `cu_test_owner_${randomUUID()}`;
const OTHER_USER_ID  = `cu_test_other_${randomUUID()}`;
const TEST_CERT_ID   = `cert-${randomUUID()}`;
const TEST_SESSION_ID = `cs_test_cert_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const TEST_SECRET    = `whsec_test_${randomUUID().replace(/-/g, "")}`;

const testSecretsLoader: SecretsLoader = async () => [TEST_SECRET];
const emptySecretsLoader: SecretsLoader = async () => [];

// ── DB helpers ────────────────────────────────────────────────────────────────

async function insertTestUser(id: string): Promise<void> {
  await db.insert(usersTable).values({ id }).onConflictDoNothing();
}

async function insertLockedCert(certId: string, ownerUserId: string): Promise<void> {
  await db
    .insert(ipCertStubsTable)
    .values({
      certId,
      denominator: "a".repeat(32),
      handshake: "b".repeat(64),
      contentHash: "c".repeat(64),
      artist: "Test Artist",
      ownerUserId,
      // unlockedAt left NULL — cert starts locked
    })
    .onConflictDoNothing();
}

async function getCertRow(certId: string) {
  const [row] = await db
    .select()
    .from(ipCertStubsTable)
    .where(eq(ipCertStubsTable.certId, certId));
  return row ?? null;
}

async function setup(): Promise<void> {
  await insertTestUser(TEST_USER_ID);
  await insertTestUser(OTHER_USER_ID);
  await insertLockedCert(TEST_CERT_ID, TEST_USER_ID);
}

async function teardown(): Promise<void> {
  await db.execute(sql`DELETE FROM ip_cert_stubs WHERE cert_id = ${TEST_CERT_ID}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${TEST_USER_ID}, ${OTHER_USER_ID})`);
}

// ── Scenario A: successful cert unlock ────────────────────────────────────────

async function testCertUnlock(): Promise<void> {
  console.log("\nCert-unlock A: checkout.session.completed unlocks the certificate");

  await setup();
  try {
    const payload = makeCertUnlockEvent({
      sessionId: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      certId: TEST_CERT_ID,
    });
    const payloadBuf = Buffer.from(payload, "utf8");
    const signature  = makeStripeSignature(payload, TEST_SECRET);

    let threw = false;
    let thrownMsg = "";
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch (err) {
      threw = true;
      thrownMsg = err instanceof Error ? err.message : String(err);
    }

    check("A1. processWebhook resolves without error", !threw, threw ? thrownMsg : "");

    const row = await getCertRow(TEST_CERT_ID);
    check("A2. unlockedAt is set (cert is now unlocked)", !!row?.unlockedAt, `unlockedAt=${String(row?.unlockedAt)}`);
    check("A3. unlockSource is 'purchase'", row?.unlockSource === "purchase", `got: ${row?.unlockSource}`);
    check("A4. stripeSessionId matches checkout session", row?.stripeSessionId === TEST_SESSION_ID, `got: ${row?.stripeSessionId}`);

    // ── Scenario B: duplicate webhook delivery ────────────────────────────────
    console.log("\nCert-unlock B: duplicate webhook delivery is a no-op");

    const unlockedAtBefore = row?.unlockedAt;
    let replayThrew = false;
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch {
      replayThrew = true;
    }

    check("B1. replay does not throw", !replayThrew);

    const rowAfterReplay = await getCertRow(TEST_CERT_ID);
    // Timestamps stored in Postgres round-trip through JS Date; compare value equality.
    const sameTimestamp =
      rowAfterReplay?.unlockedAt !== null &&
      unlockedAtBefore !== null &&
      unlockedAtBefore !== undefined &&
      rowAfterReplay?.unlockedAt !== undefined &&
      new Date(rowAfterReplay.unlockedAt).getTime() === new Date(unlockedAtBefore).getTime();
    check("B2. unlockedAt unchanged after replay (idempotent)", sameTimestamp,
      `before=${String(unlockedAtBefore)} after=${String(rowAfterReplay?.unlockedAt)}`);
    check("B3. unlockSource still 'purchase' after replay", rowAfterReplay?.unlockSource === "purchase",
      `got: ${rowAfterReplay?.unlockSource}`);

    // ── Scenario E: a fresh replay of an already-unlocked cert ───────────────
    console.log("\nCert-unlock E: fresh replay after unlock is still idempotent");
    let replay2Threw = false;
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch {
      replay2Threw = true;
    }
    check("E1. second replay does not throw", !replay2Threw);
    const rowAfterReplay2 = await getCertRow(TEST_CERT_ID);
    // E2: unlockedAt must be unchanged — compare timestamps.
    const sameTimestamp2 =
      rowAfterReplay2?.unlockedAt !== null &&
      rowAfterReplay2?.unlockedAt !== undefined &&
      rowAfterReplay?.unlockedAt !== null &&
      rowAfterReplay?.unlockedAt !== undefined &&
      new Date(rowAfterReplay2.unlockedAt).getTime() === new Date(rowAfterReplay.unlockedAt).getTime();
    check("E2. unlockedAt unchanged after second replay (idempotent)", sameTimestamp2,
      `before=${String(rowAfterReplay?.unlockedAt)} after=${String(rowAfterReplay2?.unlockedAt)}`);
  } finally {
    await teardown();
  }
}

// ── Scenario C: wrong-secret event ───────────────────────────────────────────

async function testWrongSecretNoUnlock(): Promise<void> {
  console.log("\nCert-unlock C: wrong-secret event does NOT unlock the certificate");

  const certId    = `cert-c-${randomUUID()}`;
  const userId    = `cu_test_c_${randomUUID()}`;
  const sessionId = `cs_test_cert_c_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  await insertTestUser(userId);
  await insertLockedCert(certId, userId);

  try {
    const payload = makeCertUnlockEvent({ sessionId, userId, certId });
    const payloadBuf = Buffer.from(payload, "utf8");
    const wrongSecret = `whsec_wrong_${randomUUID().replace(/-/g, "")}`;
    const badSig = makeStripeSignature(payload, wrongSecret);

    try {
      // testSecretsLoader provides [TEST_SECRET]; the payload is signed with wrongSecret.
      // constructEvent fails → event stays null → cert handler is skipped.
      await WebhookHandlers.processWebhook(payloadBuf, badSig, undefined, testSecretsLoader);
    } catch {
      // stripe-replit-sync may also reject — that's fine.
    }

    const row = await getCertRow(certId);
    check("C1. unlockedAt remains NULL after wrong-secret event", row?.unlockedAt === null || row?.unlockedAt === undefined,
      `got unlockedAt=${String(row?.unlockedAt)}`);
  } finally {
    await db.execute(sql`DELETE FROM ip_cert_stubs WHERE cert_id = ${certId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
}

// ── Scenario D: wrong-owner webhook ──────────────────────────────────────────

async function testWrongOwnerNoUnlock(): Promise<void> {
  console.log("\nCert-unlock D: webhook for wrong user does NOT unlock the certificate");

  // Two users; cert belongs to TEST_USER_ID but attacker provides OTHER_USER_ID.
  const certId    = `cert-d-${randomUUID()}`;
  const sessionId = `cs_test_cert_d_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  await insertTestUser(TEST_USER_ID);
  await insertTestUser(OTHER_USER_ID);
  await insertLockedCert(certId, TEST_USER_ID);

  try {
    // Webhook metadata claims OTHER_USER_ID as the payer, but cert owner is TEST_USER_ID.
    const payload = makeCertUnlockEvent({ sessionId, userId: OTHER_USER_ID, certId });
    const payloadBuf = Buffer.from(payload, "utf8");
    const signature  = makeStripeSignature(payload, TEST_SECRET);

    let threw = false;
    try {
      await WebhookHandlers.processWebhook(payloadBuf, signature, undefined, testSecretsLoader);
    } catch {
      threw = true;
    }
    // Handler processes without crashing — the WHERE clause just matches 0 rows.
    check("D1. processWebhook does not throw for mismatched owner", !threw);

    const row = await getCertRow(certId);
    check("D2. unlockedAt remains NULL when user_id != ownerUserId",
      row?.unlockedAt === null || row?.unlockedAt === undefined,
      `got unlockedAt=${String(row?.unlockedAt)}`);
  } finally {
    await db.execute(sql`DELETE FROM ip_cert_stubs WHERE cert_id = ${certId}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${TEST_USER_ID}, ${OTHER_USER_ID})`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await testCertUnlock();        // A + B + E
  await testWrongSecretNoUnlock(); // C
  await testWrongOwnerNoUnlock();  // D

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
