import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { StripeSync } from "stripe-replit-sync";
import { logger } from "./logger";

export interface StripeBackfillLogger {
  info(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface StripeBackfillDependencies {
  execute: typeof db.execute;
  logger: StripeBackfillLogger;
}

const defaultDependencies: StripeBackfillDependencies = {
  execute: db.execute.bind(db),
  logger,
};

function getMissingCustomerId(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/No such customer:\s*['"]([^'"]+)['"]/i);
  return match?.[1] ?? null;
}

export async function markMissingMirroredCustomer(
  err: unknown,
  dependencies: StripeBackfillDependencies = defaultDependencies,
): Promise<boolean> {
  const stripeError = err as { code?: string; param?: string };
  if (stripeError?.code !== "resource_missing" || stripeError?.param !== "customer") {
    return false;
  }

  const customerId = getMissingCustomerId(err);
  if (!customerId) {
    dependencies.logger.info(
      "Stripe backfill skipped a stale mirrored customer; no customer ID was present to mark deleted",
    );
    return true;
  }

  // stripe-replit-sync exposes deleted as a generated column derived from its
  // raw payload, so update the payload rather than the generated projection.
  // Keep the row for historical data, but exclude it from future backfills so
  // one foreign-account customer cannot repeatedly abort startup.
  await dependencies.execute(
    sql`UPDATE stripe.customers
        SET _raw_data = jsonb_set(
          COALESCE(_raw_data, '{}'::jsonb),
          '{deleted}',
          'true'::jsonb,
          true
        )
        WHERE id = ${customerId}`,
  );
  dependencies.logger.info(
    { customerId },
    "Stripe backfill skipped and marked a stale mirrored customer as deleted",
  );
  return true;
}

export function runStripeBackfill(
  stripeSync: Pick<StripeSync, "syncBackfill">,
  dependencies: StripeBackfillDependencies = defaultDependencies,
): Promise<void> {
  return stripeSync
    .syncBackfill({ object: "all" })
    .then(() => dependencies.logger.info("Stripe data backfill complete"))
    .catch(async (err: unknown) => {
      // A local mirror can contain a customer from a previous Stripe account.
      // Mark only that missing customer as deleted and keep real backfill
      // failures visible.
      try {
        const handled = await markMissingMirroredCustomer(err, dependencies);
        if (!handled) dependencies.logger.error({ err }, "Stripe backfill error");
      } catch (markErr: unknown) {
        dependencies.logger.error(
          { err: markErr },
          "Failed to mark stale Stripe customer mirror row",
        );
      }
    });
}