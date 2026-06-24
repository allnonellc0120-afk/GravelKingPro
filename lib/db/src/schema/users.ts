import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").unique(),
  email: text("email"),
  firstName: text("first_name"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  isPro: boolean("is_pro").default(false),
  subscriptionTier: text("subscription_tier"),
  lastSubmissionDate: timestamp("last_submission_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
