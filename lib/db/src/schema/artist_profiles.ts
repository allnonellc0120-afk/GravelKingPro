import { boolean, index, text, timestamp, uuid, varchar, pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const artistProfilesTable = pgTable(
  "artist_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    bio: text("bio").notNull().default(""),
    genre: text("genre").notNull().default(""),
    subGenres: text("sub_genres").notNull().default(""),
    tempo: text("tempo").notNull().default(""),
    stylisticRules: text("stylistic_rules").notNull().default(""),
    lifeEvents: text("life_events").notNull().default(""),
    emotionalHistory: text("emotional_history").notNull().default(""),
    storytellingThemes: text("storytelling_themes").notNull().default(""),
    lyricalCadence: text("lyrical_cadence").notNull().default(""),
    vocalStyle: text("vocal_style").notNull().default(""),
    vocabularyHabits: text("vocabulary_habits").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("artist_profiles_user_id_idx").on(table.userId)],
);

export type ArtistProfile = typeof artistProfilesTable.$inferSelect;
export type InsertArtistProfile = typeof artistProfilesTable.$inferInsert;