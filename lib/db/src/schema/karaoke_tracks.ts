import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Public community backing tracks. The object itself is stored in public object
 * storage; this table is the durable catalogue and attribution record.
 */
export const karaokeTracksTable = pgTable("karaoke_tracks", {
  id: uuid("id").defaultRandom().primaryKey(),
  uploaderUserId: varchar("uploader_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assetUrl: text("asset_url").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  bpm: integer("bpm"),
  duration: integer("duration").notNull().default(0),
  uploaderArtistName: varchar("uploader_artist_name", { length: 120 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KaraokeTrack = typeof karaokeTracksTable.$inferSelect;
export type InsertKaraokeTrack = typeof karaokeTracksTable.$inferInsert;