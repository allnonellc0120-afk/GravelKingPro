import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const mlkInquiriesTable = pgTable("mlk_inquiries", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  tier: varchar("tier", { length: 50 }).notNull(),
  nodeCount: varchar("node_count", { length: 100 }),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mlkLicensesTable = pgTable("mlk_licenses", {
  id: serial("id").primaryKey(),
  licenseKey: varchar("license_key", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  tier: varchar("tier", { length: 50 }).notNull(),
  active: boolean("active").notNull().default(true),
  sessionId: varchar("session_id", { length: 255 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  runsUsed: integer("runs_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mlkBenchmarkRunsTable = pgTable("mlk_benchmark_runs", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 255 }),
  licenseKey: varchar("license_key", { length: 255 }),
  matrixSize: integer("matrix_size").notNull(),
  gflops: real("gflops").notNull(),
  peakGflops: real("peak_gflops").notNull(),
  minGflops: real("min_gflops").notNull(),
  stdGflops: real("std_gflops").notNull(),
  avgTimeSec: real("avg_time_sec").notNull(),
  mmapLocked: boolean("mmap_locked").notNull().default(false),
  numaAware: boolean("numa_aware").notNull().default(false),
  blasBackend: varchar("blas_backend", { length: 255 }),
  licensed: boolean("licensed").notNull().default(false),
  demo: boolean("demo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MlkInquiry = typeof mlkInquiriesTable.$inferSelect;
export type InsertMlkInquiry = typeof mlkInquiriesTable.$inferInsert;
export type MlkLicense = typeof mlkLicensesTable.$inferSelect;
export type InsertMlkLicense = typeof mlkLicensesTable.$inferInsert;
export type MlkBenchmarkRun = typeof mlkBenchmarkRunsTable.$inferSelect;
export type InsertMlkBenchmarkRun = typeof mlkBenchmarkRunsTable.$inferInsert;
