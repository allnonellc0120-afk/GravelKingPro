import http from "node:http";
import { randomUUID } from "node:crypto";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { db, creditTransactionsTable, sessionsTable, usersTable } from "@workspace/db";
import app from "../app";
import { grantCredits, spendCredits } from "../lib/credits";
import { fulfillCreditPurchasePaymentIntent } from "../webhookHandlers";

const userId = `credit-test-${randomUUID()}`;
const email = `${userId}@example.test`;
const sessionId = randomBytes(32).toString("hex");
const otherUserId = `credit-test-other-${randomUUID()}`;
const otherEmail = `${otherUserId}@example.test`;

async function main(): Promise<void> {
  await db.insert(usersTable).values({ id: userId, email, creditsBalance: 20 });
  await db.insert(usersTable).values({ id: otherUserId, email: otherEmail });
  await db.insert(sessionsTable).values({
    sid: sessionId,
    sess: { user: { id: userId }, access_token: "credit-test-access-token" },
    expire: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const appServer = http.createServer(app);
  try {
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
    const auth = { Authorization: `Bearer ${sessionId}` };

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        spendCredits(userId, 4, "song", `concurrent-song:${index}`),
      ),
    );
    const successfulSpends = results.filter((result) => result.ok);
    if (successfulSpends.length !== 5) {
      throw new Error(`expected 5 concurrent spends, got ${successfulSpends.length}`);
    }

    const [afterSpends] = await db
      .select({ creditsBalance: usersTable.creditsBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (afterSpends?.creditsBalance !== 0) {
      throw new Error(`expected zero balance after atomic spends, got ${afterSpends?.creditsBalance}`);
    }

    const firstGrant = await grantCredits(userId, 40, "subscription_monthly", "test-invoice:unique");
    const duplicateGrant = await grantCredits(userId, 40, "subscription_monthly", "test-invoice:unique");
    if (!firstGrant.granted || duplicateGrant.granted || duplicateGrant.balance !== 40) {
      throw new Error("duplicate grant was not idempotent");
    }

    const [beforePaymentWebhook] = await db
      .select({ creditsBalance: usersTable.creditsBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (beforePaymentWebhook?.creditsBalance !== 40) {
      throw new Error(`expected delayed payment to leave balance at 40 before webhook, got ${beforePaymentWebhook?.creditsBalance}`);
    }

    const paymentIntentId = `pi_wallet_test_${randomUUID()}`;
    const paymentIntent = {
      id: paymentIntentId,
      metadata: {
        kind: "credits_purchase",
        user_id: userId,
        credits: "10",
      },
    };
    const unsettledResponse = await fetch(
      `${base}/api/credits/purchase-status?paymentIntentId=${encodeURIComponent(paymentIntentId)}`,
      { headers: auth },
    );
    const unsettledBody = await unsettledResponse.json() as { settled?: boolean };
    if (unsettledResponse.status !== 200 || unsettledBody.settled !== false) {
      throw new Error(
        `expected unsettled purchase status before webhook, got ${unsettledResponse.status} ${JSON.stringify(unsettledBody)}`,
      );
    }

    const otherPaymentIntentId = `pi_other_user_${randomUUID()}`;
    await grantCredits(otherUserId, 10, "stripe_purchase", `stripe-payment-intent:${otherPaymentIntentId}`, otherPaymentIntentId);
    const otherUserResponse = await fetch(
      `${base}/api/credits/purchase-status?paymentIntentId=${encodeURIComponent(otherPaymentIntentId)}`,
      { headers: auth },
    );
    const otherUserBody = await otherUserResponse.json() as { settled?: boolean };
    if (otherUserResponse.status !== 200 || otherUserBody.settled !== false) {
      throw new Error(
        `expected another user's PaymentIntent to remain unsettled, got ${otherUserResponse.status} ${JSON.stringify(otherUserBody)}`,
      );
    }

    // The first delivery represents a delayed webhook arriving after the
    // Payment Element has already confirmed in the browser. The replay uses
    // the same PaymentIntent id, just as Stripe does on a retry.
    const paymentGrant = await fulfillCreditPurchasePaymentIntent(paymentIntent);
    const duplicatePaymentGrant = await fulfillCreditPurchasePaymentIntent(paymentIntent);
    if (!paymentGrant.granted || duplicatePaymentGrant.granted || duplicatePaymentGrant.balance !== 50) {
      throw new Error("duplicate payment-intent grant was not idempotent");
    }

    const settledResponse = await fetch(
      `${base}/api/credits/purchase-status?paymentIntentId=${encodeURIComponent(paymentIntentId)}`,
      { headers: auth },
    );
    const settledBody = await settledResponse.json() as { settled?: boolean };
    if (settledResponse.status !== 200 || settledBody.settled !== true) {
      throw new Error(
        `expected settled purchase status after webhook, got ${settledResponse.status} ${JSON.stringify(settledBody)}`,
      );
    }

    console.log("credits wallet concurrency/payment-idempotency/settlement checks passed");
  } finally {
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    await db.delete(creditTransactionsTable).where(eq(creditTransactionsTable.userId, userId));
    await db.delete(creditTransactionsTable).where(eq(creditTransactionsTable.userId, otherUserId));
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    await db.delete(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.email, email)));
    await db.delete(usersTable).where(and(eq(usersTable.id, otherUserId), eq(usersTable.email, otherEmail)));
  }
}

await main();