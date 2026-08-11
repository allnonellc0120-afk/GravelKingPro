/**
 * Integration test: referral commission accrual from verified Stripe webhooks.
 *
 * Scenarios:
 *   A) invoice.paid (amount_paid > 0) for an attributed customer → commission row
 *   B) Replay of same invoice.paid is idempotent (one commission per invoice)
 *   C) $0 invoice (trial) accrues NO commission
 *   D) Self-referral accrues NO commission (defense in depth)
 *   E) charge.refunded reverses the commission
 *   F) Unapproved promoter accrues NO commission
 */

import { createHmac, randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";

import { WebhookHandlers, type SecretsLoader } from "../webhookHandlers";
import {
  db,
  usersTable,
  promotersTable,
  referralAttributionsTable,
  commissionsTable,
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

function makeStripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

function makeInvoicePaidEvent(opts: {
  invoiceId: string;
  customerId: string;
  amountPaid: number;
}): string {
  return JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "event",
    type: "invoice.paid",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.invoiceId,
        object: "invoice",
        customer: opts.customerId,
        amount_paid: opts.amountPaid,
        currency: "usd",
        status: "paid",
      },
    },
  });
}

function makeChargeRefundedEvent(opts: {
  chargeId: string;
  invoiceId: string;
  amount: number;
  amountRefunded: number;
}): string {
  return JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "event",
    type: "charge.refunded",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.chargeId,
        object: "charge",
        invoice: opts.invoiceId,
        amount: opts.amount,
        amount_refunded: opts.amountRefunded,
        refunded: opts.amountRefunded >= opts.amount,
      },
    },
  });
}

// ── Test fixtures ─────────────────────────────────────────────────────────────
const PROMOTER_USER = `ref_test_promoter_${randomUUID()}`;
const REFERRED_USER = `ref_test_referred_${randomUUID()}`;
const REFERRED_CUSTOMER = `cus_test_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
const PROMOTER_CUSTOMER = `cus_test_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
const TEST_SECRET = `whsec_test_${randomUUID().replace(/-/g, "")}`;
const testSecretsLoader: SecretsLoader = async () => [TEST_SECRET];

let promoterId = "";

async function send(payload: string): Promise<void> {
  const buf = Buffer.from(payload, "utf8");
  const sig = makeStripeSignature(payload, TEST_SECRET);
  try {
    await WebhookHandlers.processWebhook(buf, sig, undefined, testSecretsLoader);
  } catch {
    // Expected: after our custom handling, stripe-replit-sync rejects the
    // test signature. Commission accrual happens before that and must persist.
  }
}

async function commissionsFor(invoiceId: string) {
  return db
    .select()
    .from(commissionsTable)
    .where(eq(commissionsTable.stripeInvoiceId, invoiceId));
}

async function setup(): Promise<void> {
  await db.insert(usersTable).values([
    { id: PROMOTER_USER, stripeCustomerId: PROMOTER_CUSTOMER },
    { id: REFERRED_USER, stripeCustomerId: REFERRED_CUSTOMER },
  ]).onConflictDoNothing();

  const [p] = await db
    .insert(promotersTable)
    .values({
      userId: PROMOTER_USER,
      code: `T${randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()}`,
      status: "approved",
      commissionRate: 30,
    })
    .returning();
  promoterId = p.id;

  await db.insert(referralAttributionsTable).values([
    { userId: REFERRED_USER, promoterId },
    // Self-referral attribution (should never accrue; simulates a bad row)
    { userId: PROMOTER_USER, promoterId },
  ]);
}

async function teardown(): Promise<void> {
  await db.execute(sql`DELETE FROM commissions WHERE promoter_id = ${promoterId}::uuid`);
  await db.execute(sql`DELETE FROM referral_attributions WHERE promoter_id = ${promoterId}::uuid`);
  await db.execute(sql`DELETE FROM referral_clicks WHERE promoter_id = ${promoterId}::uuid`);
  await db.execute(sql`DELETE FROM promoters WHERE id = ${promoterId}::uuid`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${PROMOTER_USER}, ${REFERRED_USER})`);
}

async function main(): Promise<void> {
  await setup();
  try {
    // A: paid invoice accrues 30% commission
    console.log("\nReferral A: invoice.paid accrues commission for attributed user");
    const invA = `in_test_a_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    await send(makeInvoicePaidEvent({ invoiceId: invA, customerId: REFERRED_CUSTOMER, amountPaid: 1999 }));
    let rows = await commissionsFor(invA);
    check("A1. commission row inserted", rows.length === 1, `found ${rows.length}`);
    check("A2. commission is 30% of 1999 = 599", rows[0]?.commissionCents === 599, `got ${rows[0]?.commissionCents}`);
    check("A3. status is pending", rows[0]?.status === "pending", `got ${rows[0]?.status}`);

    // B: replay idempotent
    console.log("\nReferral B: replay of same invoice is idempotent");
    await send(makeInvoicePaidEvent({ invoiceId: invA, customerId: REFERRED_CUSTOMER, amountPaid: 1999 }));
    rows = await commissionsFor(invA);
    check("B1. still exactly one commission", rows.length === 1, `found ${rows.length}`);

    // C: $0 trial invoice — no commission
    console.log("\nReferral C: $0 (trial) invoice accrues nothing");
    const invC = `in_test_c_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    await send(makeInvoicePaidEvent({ invoiceId: invC, customerId: REFERRED_CUSTOMER, amountPaid: 0 }));
    rows = await commissionsFor(invC);
    check("C1. no commission for $0 invoice", rows.length === 0, `found ${rows.length}`);

    // D: self-referral — no commission
    console.log("\nReferral D: self-referral accrues nothing");
    const invD = `in_test_d_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    await send(makeInvoicePaidEvent({ invoiceId: invD, customerId: PROMOTER_CUSTOMER, amountPaid: 1999 }));
    rows = await commissionsFor(invD);
    check("D1. no commission for self-referral", rows.length === 0, `found ${rows.length}`);

    // E: partial + full refund accounting (on a commission already marked paid)
    console.log("\nReferral E: partial refund reduces proportionally; full refund reverses");
    // Simulate admin payout first — partial refunds must not clobber 'paid'.
    await db.update(commissionsTable).set({ status: "paid" }).where(eq(commissionsTable.stripeInvoiceId, invA));
    const chargeId = `ch_test_${randomUUID().replace(/-/g, "").slice(0, 14)}`;

    // Partial refund: 500 of 1999 → net = floor(599 * 1499/1999) = 449
    const partial = makeChargeRefundedEvent({ chargeId, invoiceId: invA, amount: 1999, amountRefunded: 500 });
    await send(partial);
    rows = await commissionsFor(invA);
    check("E1. partial refund reduces commission proportionally (599 → 449)", rows[0]?.commissionCents === 449, `got ${rows[0]?.commissionCents}`);
    check("E2. refundedCents recorded", rows[0]?.refundedCents === 500, `got ${rows[0]?.refundedCents}`);
    check("E3. status stays paid on partial refund", rows[0]?.status === "paid", `got ${rows[0]?.status}`);
    check("E4. original commission preserved", rows[0]?.originalCommissionCents === 599, `got ${rows[0]?.originalCommissionCents}`);

    // Replay of the same refund webhook — idempotent (cumulative amount_refunded)
    await send(partial);
    rows = await commissionsFor(invA);
    check("E5. replayed refund webhook is idempotent", rows[0]?.commissionCents === 449 && rows[0]?.refundedCents === 500, `got ${rows[0]?.commissionCents}/${rows[0]?.refundedCents}`);

    // Second partial refund (cumulative 1000): net = floor(599 * 999/1999) = 299
    await send(makeChargeRefundedEvent({ chargeId, invoiceId: invA, amount: 1999, amountRefunded: 1000 }));
    rows = await commissionsFor(invA);
    check("E6. second partial refund recomputes from original (→ 299)", rows[0]?.commissionCents === 299, `got ${rows[0]?.commissionCents}`);

    // Full refund: commission zeroed and reversed
    await send(makeChargeRefundedEvent({ chargeId, invoiceId: invA, amount: 1999, amountRefunded: 1999 }));
    rows = await commissionsFor(invA);
    check("E7. full refund zeroes the commission", rows[0]?.commissionCents === 0, `got ${rows[0]?.commissionCents}`);
    check("E8. full refund marks commission reversed", rows[0]?.status === "reversed", `got ${rows[0]?.status}`);

    // F: unapproved promoter — no accrual
    console.log("\nReferral F: unapproved promoter accrues nothing");
    await db.update(promotersTable).set({ status: "pending" }).where(eq(promotersTable.id, promoterId));
    const invF = `in_test_f_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    await send(makeInvoicePaidEvent({ invoiceId: invF, customerId: REFERRED_CUSTOMER, amountPaid: 1999 }));
    rows = await commissionsFor(invF);
    check("F1. no commission when promoter not approved", rows.length === 0, `found ${rows.length}`);
  } finally {
    await teardown();
  }

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
