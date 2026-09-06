import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, creditTransactionsTable, usersTable } from "@workspace/db";
import { grantCredits, spendCredits } from "../lib/credits";
import { fulfillCreditPurchasePaymentIntent } from "../webhookHandlers";

const userId = `credit-test-${randomUUID()}`;
const email = `${userId}@example.test`;

async function main(): Promise<void> {
  await db.insert(usersTable).values({ id: userId, email, creditsBalance: 20 });
  try {
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

    const paymentIntent = {
      id: "pi_wallet_test",
      metadata: {
        kind: "credits_purchase",
        user_id: userId,
        credits: "10",
      },
    };
    // The first delivery represents a delayed webhook arriving after the
    // Payment Element has already confirmed in the browser. The replay uses
    // the same PaymentIntent id, just as Stripe does on a retry.
    const paymentGrant = await fulfillCreditPurchasePaymentIntent(paymentIntent);
    const duplicatePaymentGrant = await fulfillCreditPurchasePaymentIntent(paymentIntent);
    if (!paymentGrant.granted || duplicatePaymentGrant.granted || duplicatePaymentGrant.balance !== 50) {
      throw new Error("duplicate payment-intent grant was not idempotent");
    }

    console.log("credits wallet concurrency/payment-idempotency checks passed");
  } finally {
    await db.delete(creditTransactionsTable).where(eq(creditTransactionsTable.userId, userId));
    await db.delete(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.email, email)));
  }
}

await main();