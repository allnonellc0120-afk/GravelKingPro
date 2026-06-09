import { pgTable, serial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * First-party analytics events.
 *
 * One row per tracked event. Types currently emitted:
 *  - "pageview"            — public beacon from the web client (per location change)
 *  - "checkout_started"    — emitted server-side when a Stripe Checkout session is created
 *  - "subscription_activated" — reserved for future webhook-driven conversion events
 */
export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    // Anonymous per-browser id (gk_vid cookie). Used for unique-visitor counts.
    visitorId: text("visitor_id"),
    // Subscription session id (gk_session cookie) when present.
    sessionId: text("session_id"),
    path: text("path"),
    referrer: text("referrer"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_analytics_type_created").on(table.type, table.createdAt),
    index("idx_analytics_created").on(table.createdAt),
  ],
);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEventsTable.$inferInsert;
