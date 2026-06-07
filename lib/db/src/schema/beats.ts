import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const beatsTable = pgTable("beats", {
  id:            serial("id").primaryKey(),
  title:         varchar("title", { length: 255 }).notNull(),
  artist:        varchar("artist", { length: 255 }).notNull().default("GravelKing"),
  genre:         varchar("genre", { length: 100 }),
  bpm:           integer("bpm"),
  description:   text("description"),
  tags:          varchar("tags", { length: 500 }),
  audioUrl:      varchar("audio_url", { length: 1000 }),
  fileName:      varchar("file_name", { length: 255 }),
  mimeType:      varchar("mime_type", { length: 80 }).default("audio/mpeg"),
  isFeatured:    boolean("is_featured").notNull().default(false),
  monthYear:     varchar("month_year", { length: 7 }),
  isActive:      boolean("is_active").notNull().default(true),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Beat         = typeof beatsTable.$inferSelect;
export type InsertBeat   = typeof beatsTable.$inferInsert;
