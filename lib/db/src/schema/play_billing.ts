import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Google Play subscription entitlements.
 *
 * A row links a Play purchaseToken (the canonical proof-of-purchase from
 * Google Play Billing) to a signed-in user account, so a subscription bought
 * inside the Android app unlocks Pro on every platform (web included).
 * Google is the source of truth: rows are written only after server-side
 * verification against the Play Developer API, and re-verified lazily when
 * the cached expiry passes (renewals extend expiryTime).
 */
export const playSubscriptionsTable = pgTable(
  "play_subscriptions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => usersTable.id),
    /** Play purchase token — unique: one purchase can only unlock one account. */
    purchaseToken: text("purchase_token").notNull().unique(),
    /** Play product id, e.g. gk_weekly / gk_studio / gk_node_auditor. */
    productId: varchar("product_id").notNull(),
    /** Canonical tier: weekly | monthly | node_auditor. */
    tier: varchar("tier").notNull(),
    /** active | grace | canceled | expired | on_hold | paused | pending | replaced | invalid */
    state: varchar("state").notNull().default("active"),
    expiryTime: timestamp("expiry_time", { withTimezone: true }),
    autoRenewing: boolean("auto_renewing").notNull().default(true),
    /** Play purchases must be acknowledged within 3 days or Google refunds them. */
    acknowledged: boolean("acknowledged").notNull().default(false),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("idx_play_subscriptions_user").on(t.userId)],
);

export type PlaySubscription = typeof playSubscriptionsTable.$inferSelect;
export type InsertPlaySubscription = typeof playSubscriptionsTable.$inferInsert;
