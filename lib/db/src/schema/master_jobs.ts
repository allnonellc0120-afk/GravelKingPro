import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Durable record for a mastering request. Audio bytes remain in private object
 * storage; this table holds only the state and object key required to resume a
 * user's download after the originating HTTP request has ended.
 */
export const masterJobsTable = pgTable(
  "jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    type: varchar("type", { length: 32 }).notNull().default("mastering"),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    stage: varchar("stage", { length: 64 }).notNull().default("queued"),
    originalFilename: varchar("original_filename", { length: 255 }),
    inputRef: text("input_ref"),
    requestConfig: jsonb("request_config"),
    outputObjectKey: text("output_object_key"),
    outputUrl: text("output_url"),
    downloadFilename: varchar("download_filename", { length: 255 }),
    error: text("error"),
    clientJobId: varchar("client_job_id", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("master_jobs_user_created_idx").on(table.userId, table.createdAt),
    index("master_jobs_status_updated_idx").on(table.status, table.updatedAt),
    uniqueIndex("master_jobs_client_job_id_unique").on(table.clientJobId),
    uniqueIndex("master_jobs_idempotency_key_unique").on(table.idempotencyKey),
  ],
);

export type MasterJob = typeof masterJobsTable.$inferSelect;
export type InsertMasterJob = typeof masterJobsTable.$inferInsert;