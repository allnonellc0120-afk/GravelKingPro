import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Immutable wallet ledger. The users.credits_balance column is the fast read
 * path; every change is paired with one row here so webhook retries and
 * action retries cannot mint or spend credits twice.
 */
export const creditTransactionsTable = pgTable(
  "credit_transactions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    kind: text("kind").notNull(),
    reference: text("reference"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("credit_transactions_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("credit_transactions_reference_idx").on(table.reference),
    uniqueIndex("credit_transactions_stripe_intent_idx").on(table.stripePaymentIntentId),
  ],
);

export type CreditTransaction = typeof creditTransactionsTable.$inferSelect;