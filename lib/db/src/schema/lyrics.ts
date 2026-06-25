import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const lyricProjectsTable = pgTable("lyric_projects", {
  id: text("id").primaryKey(),
  sessionId: text("session_id"),
  title: text("title").notNull().default("Untitled"),
  aiDraft: text("ai_draft").notNull(),
  currentContent: text("current_content").notNull(),
  authorshipScore: integer("authorship_score").default(0),
  isCopyrightEligible: boolean("is_copyright_eligible").default(false),
  genre: text("genre"),
  bpm: integer("bpm"),
  sunoPrompt: text("suno_prompt"),
  isAiOnly: boolean("is_ai_only").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lyricRevisionsTable = pgTable("lyric_revisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lyricProjectsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  authorshipScore: integer("authorship_score").default(0),
  changedLines: jsonb("changed_lines"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LyricProject = typeof lyricProjectsTable.$inferSelect;
export type LyricRevision = typeof lyricRevisionsTable.$inferSelect;
