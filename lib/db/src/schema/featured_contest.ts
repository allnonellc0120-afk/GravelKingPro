import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { masterJobsTable } from "./master_jobs";

export const featuredContestStatusEnum = pgEnum("featured_contest_status", [
  "open",
  "closed",
  "archived",
]);

export const featuredEntryStatusEnum = pgEnum("featured_entry_status", [
  "submitted",
  "selected",
  "not_selected",
  "withdrawn",
]);

export const outreachCatalogStatusEnum = pgEnum("outreach_catalog_status", [
  "draft",
  "approved",
  "sent",
  "failed",
  "cancelled",
]);

export const outreachDeliveryStatusEnum = pgEnum("outreach_delivery_status", [
  "queued",
  "sent",
  "failed",
]);

/**
 * A label contest round. The server treats maxSlots as a hard cap and only
 * creates rounds with ten slots; keeping the value on the row makes the
 * round self-describing if the label later needs historical rounds.
 */
export const featuredContestsTable = pgTable(
  "featured_contests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    status: featuredContestStatusEnum("status").notNull().default("open"),
    maxSlots: integer("max_slots").notNull().default(10),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("featured_contests_status_created_idx").on(table.status, table.createdAt),
  ],
);

/**
 * A mastered Main Stage performance submitted to a round. The master job is
 * the source of truth for eligibility: contest routes require that it belongs
 * to the submitting user, is completed, and was created with sourceContext
 * "main_stage".
 */
export const featuredArtistEntriesTable = pgTable(
  "featured_artist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => featuredContestsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    masterJobId: varchar("master_job_id", { length: 64 })
      .notNull()
      .references(() => masterJobsTable.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 255 }).notNull(),
    artistName: varchar("artist_name", { length: 255 }).notNull(),
    source: varchar("source", { length: 32 }).notNull().default("main_stage"),
    status: featuredEntryStatusEnum("status").notNull().default("submitted"),
    isActive: boolean("is_active").notNull().default(true),
    slotNumber: integer("slot_number"),
    featureConsentAt: timestamp("feature_consent_at", { withTimezone: true }).notNull(),
    featureConsentVersion: varchar("feature_consent_version", { length: 32 }).notNull().default("v1"),
    outreachConsentAt: timestamp("outreach_consent_at", { withTimezone: true }),
    outreachConsentVersion: varchar("outreach_consent_version", { length: 32 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("featured_entries_contest_status_idx").on(table.contestId, table.status),
    index("featured_entries_user_idx").on(table.userId, table.createdAt),
    uniqueIndex("featured_entries_contest_master_job_uniq").on(table.contestId, table.masterJobId),
    uniqueIndex("featured_entries_contest_slot_uniq").on(table.contestId, table.slotNumber),
  ],
);

/**
 * One original track package prepared for a selected artist. It is kept
 * private and can only be shared by an approved, consented delivery.
 */
export const labelOutreachCatalogsTable = pgTable(
  "label_outreach_catalogs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => featuredArtistEntriesTable.id, { onDelete: "cascade" }),
    originalTitle: varchar("original_title", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    originalObjectKey: text("original_object_key").notNull(),
    status: outreachCatalogStatusEnum("status").notNull().default("draft"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: varchar("approved_by", { length: 255 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("label_outreach_catalogs_entry_idx").on(table.entryId, table.createdAt),
  ],
);

export const labelOutreachDeliveriesTable = pgTable(
  "label_outreach_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => labelOutreachCatalogsTable.id, { onDelete: "cascade" }),
    labelName: varchar("label_name", { length: 255 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull().default("gmail"),
    status: outreachDeliveryStatusEnum("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("label_outreach_deliveries_catalog_idx").on(table.catalogId, table.createdAt),
  ],
);

export type FeaturedContest = typeof featuredContestsTable.$inferSelect;
export type InsertFeaturedContest = typeof featuredContestsTable.$inferInsert;
export type FeaturedArtistEntry = typeof featuredArtistEntriesTable.$inferSelect;
export type InsertFeaturedArtistEntry = typeof featuredArtistEntriesTable.$inferInsert;
export type LabelOutreachCatalog = typeof labelOutreachCatalogsTable.$inferSelect;
export type InsertLabelOutreachCatalog = typeof labelOutreachCatalogsTable.$inferInsert;
export type LabelOutreachDelivery = typeof labelOutreachDeliveriesTable.$inferSelect;
export type InsertLabelOutreachDelivery = typeof labelOutreachDeliveriesTable.$inferInsert;