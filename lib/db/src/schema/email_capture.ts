import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const emailCaptureTable = pgTable("email_captures", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  source: varchar("source", { length: 50 }).notNull(),
  referrer: varchar("referrer", { length: 500 }),
  userAgent: varchar("user_agent", { length: 500 }),
  ipHash: varchar("ip_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailCapture = typeof emailCaptureTable.$inferSelect;
export type NewEmailCapture = typeof emailCaptureTable.$inferInsert;
