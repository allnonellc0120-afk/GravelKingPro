import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const enterpriseLeadsTable = pgTable("enterprise_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  organization: varchar("organization", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(), // A&R | Publisher | Producer | Platform Developer | Other
  /** 32-byte hex — expires after 7 days; null until issued */
  demoApiKey: varchar("demo_api_key", { length: 64 }),
  demoApiKeyExpiresAt: timestamp("demo_api_key_expires_at", { withTimezone: true }),
  /** JSON blob recording what they verified (certId, warrant status, etc.) */
  verificationActivity: text("verification_activity"),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EnterpriseLead = typeof enterpriseLeadsTable.$inferSelect;
export type InsertEnterpriseLead = typeof enterpriseLeadsTable.$inferInsert;
