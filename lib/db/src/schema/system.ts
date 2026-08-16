import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Operational state used by the API startup jobs. Keeping this in the
 * canonical Drizzle schema prevents Publish from treating the table as an
 * unmanaged object and dropping its submission history.
 */
export const sitemapSubmissionLogTable = pgTable("sitemap_submission_log", {
  key: text("key").primaryKey(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SitemapSubmissionLog = typeof sitemapSubmissionLogTable.$inferSelect;