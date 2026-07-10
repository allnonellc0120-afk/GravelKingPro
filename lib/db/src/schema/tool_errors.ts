import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Structured error log for pinpoint diagnostics surfaced in the admin dashboard. */
export const toolErrorsTable = pgTable("tool_errors", {
  id: serial("id").primaryKey(),
  toolName: text("tool_name").notNull(),
  stage: text("stage").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ToolError = typeof toolErrorsTable.$inferSelect;
