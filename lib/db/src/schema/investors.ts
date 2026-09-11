import { pgTable, text, timestamp, integer, uuid, date, unique } from "drizzle-orm/pg-core";

/** One row per investor / fund prospect in the outreach pipeline. */
export const investorProspectsTable = pgTable(
  "investor_prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Display order (matches playbook numbering).
     * UNIQUE — used as the seed identity so concurrent first-loads cannot
     * create duplicate prospect sets via onConflictDoNothing.
     */
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    /** How to reach them: email, form URL, LinkedIn, etc. */
    route: text("route"),
    /** Angle / why-them notes (private, admin-only). */
    notes: text("notes"),
    /**
     * not_started | touch_1_sent | touch_2_sent | touch_3_sent |
     * responded | meeting_booked | passed | closed
     */
    status: text("status").notNull().default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("investor_prospects_sort_order_uniq").on(t.sortOrder)],
);

/** One row per outreach touch (max 3 per prospect per the playbook cadence). */
export const investorTouchesTable = pgTable(
  "investor_touches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => investorProspectsTable.id, { onDelete: "cascade" }),
    /** 1, 2, or 3 — matches the Touch 1 / Touch 2 / Touch 3 cadence. */
    touchNumber: integer("touch_number").notNull(),
    /** Calendar date the touch was sent (YYYY-MM-DD). */
    sentAt: date("sent_at"),
    /** Their reply text, if any. */
    response: text("response"),
    /** Private notes about the exchange. */
    notes: text("notes"),
    /** Explicitly approved email delivery fields. */
    recipientEmail: text("recipient_email"),
    subject: text("subject"),
    body: text("body"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** draft | queued | sending | sent | failed */
    dispatchStatus: text("dispatch_status").notNull().default("draft"),
    attempts: integer("attempts").notNull().default(0),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("investor_touches_prospect_touch_uniq").on(t.prospectId, t.touchNumber)],
);

export type InvestorProspect = typeof investorProspectsTable.$inferSelect;
export type InvestorTouch = typeof investorTouchesTable.$inferSelect;
