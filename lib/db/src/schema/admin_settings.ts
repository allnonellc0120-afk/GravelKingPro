import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Generic key/value store for admin-toggleable settings (e.g. maintenance mode). */
export const adminSettingsTable = pgTable("admin_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminSetting = typeof adminSettingsTable.$inferSelect;
