import { integer, pgTable, real, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const processRunsTable = pgTable("process_runs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  routing: varchar("routing", { length: 10 }).notNull().default("local"),
  parity: varchar("parity", { length: 20 }).notNull().default("VALIDATED"),
  efficiency: real("efficiency"),
  decayRate: real("decay_rate"),
  sampleCount: integer("sample_count"),
  fileName: varchar("file_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcessRun = typeof processRunsTable.$inferSelect;
export type InsertProcessRun = typeof processRunsTable.$inferInsert;
