import {
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const duetRoomsTable = pgTable("duet_rooms", {
  roomId: varchar("room_id", { length: 80 }).primaryKey(),
  nowPlaying: jsonb("now_playing"),
  upNext: jsonb("up_next").notNull().default([]),
  lastQueueTimestamp: bigint("last_queue_timestamp", { mode: "number" }).notNull().default(0),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
});

export const duetPeersTable = pgTable("duet_peers", {
  roomId: varchar("room_id", { length: 80 }).notNull(),
  peerId: varchar("peer_id", { length: 120 }).notNull(),
  role: varchar("role", { length: 10 }).notNull(),
  profile: jsonb("profile"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.roomId, table.peerId] }),
}));

export const duetEventsTable = pgTable("duet_events", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  roomId: varchar("room_id", { length: 80 }).notNull(),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DuetRoom = typeof duetRoomsTable.$inferSelect;
export type DuetPeer = typeof duetPeersTable.$inferSelect;
export type DuetEvent = typeof duetEventsTable.$inferSelect;