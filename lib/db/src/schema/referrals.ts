import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/** Creators who signed up to promote GravelKing Pro for a commission. */
export const promotersTable = pgTable("promoters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),
  code: text("code").notNull().unique(),
  displayName: text("display_name"),
  payoutDetails: text("payout_details"),
  /** pending | approved | rejected */
  status: text("status").notNull().default("pending"),
  /** Commission percentage of each paid invoice (0–100). */
  commissionRate: integer("commission_rate").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per unique tracked-link visit (deduped per browser via the gk_ref cookie). */
export const referralClicksTable = pgTable("referral_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  promoterId: uuid("promoter_id")
    .notNull()
    .references(() => promotersTable.id),
  visitorId: text("visitor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * First-touch attribution: which promoter referred a given user.
 * Written server-side at checkout creation (from the httpOnly gk_ref cookie),
 * never from client claims. Commission accrual joins through this table.
 */
export const referralAttributionsTable = pgTable("referral_attributions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id),
  promoterId: uuid("promoter_id")
    .notNull()
    .references(() => promotersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Commission accrued from a verified paid Stripe invoice. */
export const commissionsTable = pgTable("commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promoterId: uuid("promoter_id")
    .notNull()
    .references(() => promotersTable.id),
  userId: text("user_id").notNull(),
  /** Idempotency key — one commission per Stripe invoice. */
  stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
  invoiceAmountCents: integer("invoice_amount_cents").notNull(),
  /** Current (net) commission after any refund adjustments. */
  commissionCents: integer("commission_cents").notNull(),
  /** Commission as originally accrued — basis for proportional refund math. */
  originalCommissionCents: integer("original_commission_cents").notNull().default(0),
  /** Cumulative refunded amount from Stripe (charge.amount_refunded). */
  refundedCents: integer("refunded_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  /** pending | paid | reversed */
  status: text("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Promoter = typeof promotersTable.$inferSelect;
export type Commission = typeof commissionsTable.$inferSelect;
