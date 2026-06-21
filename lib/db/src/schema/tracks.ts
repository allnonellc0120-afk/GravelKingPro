import { pgEnum, pgTable, text, timestamp, varchar, real, uuid } from "drizzle-orm/pg-core";

export const trackStatusEnum = pgEnum("track_status", ["pending", "accepted", "rejected"]);

export const tracksTable = pgTable("tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  artistName: varchar("artist_name", { length: 255 }).notNull(),
  audioFullKey: text("audio_full_key").notNull(),
  audioPreviewKey: text("audio_preview_key").notNull(),
  coverArtKey: text("cover_art_key").notNull(),
  price: real("price").notNull().default(9.99),
  status: trackStatusEnum("status").notNull().default("pending"),
  stripeProductId: varchar("stripe_product_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  submittedByUserId: varchar("submitted_by_user_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchasedTracksTable = pgTable("purchased_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  trackId: uuid("track_id").notNull(),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Track = typeof tracksTable.$inferSelect;
export type InsertTrack = typeof tracksTable.$inferInsert;
export type PurchasedTrack = typeof purchasedTracksTable.$inferSelect;
export type InsertPurchasedTrack = typeof purchasedTracksTable.$inferInsert;
