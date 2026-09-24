import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  runStripeBackfill,
  type StripeBackfillDependencies,
  type StripeBackfillLogger,
} from "../lib/stripeBackfill";

const customerId = `cus_stale_test_${randomUUID().replaceAll("-", "")}`;

class StripeResourceMissingError extends Error {
  code = "resource_missing";
  param = "customer";

  constructor(id: string) {
    super(`No such customer: '${id}'`);
  }
}

function createTestLogger(): StripeBackfillLogger & {
  infoCalls: unknown[][];
  errorCalls: unknown[][];
} {
  const infoCalls: unknown[][] = [];
  const errorCalls: unknown[][] = [];
  return {
    infoCalls,
    errorCalls,
    info: (...args) => infoCalls.push(args),
    error: (...args) => errorCalls.push(args),
  };
}

async function main(): Promise<void> {
  const logger = createTestLogger();
  const dependencies: StripeBackfillDependencies = {
    execute: db.execute.bind(db),
    logger,
  };

  await db.execute(sql`
    INSERT INTO stripe.customers (_raw_data, _account_id)
    SELECT ${JSON.stringify({
      id: customerId,
      object: "customer",
      email: "stale-mirror-test@example.test",
      deleted: false,
    })}::jsonb, id
    FROM stripe.accounts
    LIMIT 1
  `);

  try {
    const stripeSync = {
      syncBackfill: async () => {
        throw new StripeResourceMissingError(customerId);
      },
    };

    await runStripeBackfill(stripeSync, dependencies);

    const rows = await db.execute(sql`
      SELECT _raw_data->>'deleted' AS raw_deleted, deleted
      FROM stripe.customers
      WHERE id = ${customerId}
    `);
    const row = rows.rows[0] as { raw_deleted: string; deleted: boolean } | undefined;
    if (row?.raw_deleted !== "true" || row.deleted !== true) {
      throw new Error(
        `expected stale customer to be deleted through _raw_data, got ${JSON.stringify(row)}`,
      );
    }

    const infoMessage = logger.infoCalls
      .map((args) => args.find((arg) => typeof arg === "string"))
      .find((message) => message === "Stripe backfill skipped and marked a stale mirrored customer as deleted");
    if (!infoMessage || logger.errorCalls.length !== 0) {
      throw new Error(
        `expected stale customer to log at info without an error, got ${JSON.stringify({
          info: logger.infoCalls,
          errors: logger.errorCalls,
        })}`,
      );
    }

    const unrelatedError = new Error("Stripe product listing failed");
    const unrelatedLogger = createTestLogger();
    await runStripeBackfill(
      { syncBackfill: async () => { throw unrelatedError; } },
      { ...dependencies, logger: unrelatedLogger },
    );
    const errorMessage = unrelatedLogger.errorCalls
      .map((args) => args.find((arg) => typeof arg === "string"))
      .find((message) => message === "Stripe backfill error");
    if (!errorMessage) {
      throw new Error(
        `expected unrelated backfill failure to log at error, got ${JSON.stringify(unrelatedLogger.errorCalls)}`,
      );
    }

    console.log("✓ stale Stripe mirror backfill regression checks passed");
  } finally {
    await db.execute(sql`DELETE FROM stripe.customers WHERE id = ${customerId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});