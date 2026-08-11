import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// lyric_projects — one row per songwriting session
// ─────────────────────────────────────────────────────────────────────────────
export const lyricProjectsTable = pgTable("lyric_projects", {
  id: text("id").primaryKey(),
  sessionId: text("session_id"),

  // ── Identity ──────────────────────────────────────────────────────────────
  title: text("title").notNull().default("Untitled"),
  mode: text("mode").notNull().default("simple"), // 'simple' | 'advanced'

  // ── Simple mode input ─────────────────────────────────────────────────────
  storyPrompt: text("story_prompt"),              // raw natural-language prompt

  // ── Advanced mode global parameters ──────────────────────────────────────
  bpm: integer("bpm"),
  key: text("key"),                               // e.g. "C Minor", "G Major"
  vocalType: text("vocal_type"),                  // e.g. "male tenor"
  genreTags: text("genre_tags"),                  // comma-separated raw tags

  // ── Generated content ─────────────────────────────────────────────────────
  aiDraft: text("ai_draft").notNull(),            // original Gemini output — never mutated
  currentContent: text("current_content").notNull(), // full text reconstructed from lines
  stylePrompt: text("style_prompt"),              // Gemini-generated style prompt for the in-house MLK v3.5 generator

  // ── Line-by-line state (jsonb) ────────────────────────────────────────────
  // Array of LineState objects. Shape:
  //   { id, type: 'section'|'lyric'|'empty', text, aiOriginal,
  //     isHumanEdited, sectionContext, timestampMs? }
  linesState: jsonb("lines_state"),

  // ── Authorship tracking ───────────────────────────────────────────────────
  authorshipScore: integer("authorship_score").default(0),
  isCopyrightEligible: boolean("is_copyright_eligible").default(false),
  isAiOnly: boolean("is_ai_only").default(true),

  // ── Paywall tracking ──────────────────────────────────────────────────────
  generationCount: integer("generation_count").default(1), // free limit: 2
  isLocked: boolean("is_locked").default(false),           // true = hit limit, no subscription

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // ── Legacy ────────────────────────────────────────────────────────────────
  sunoPrompt: text("suno_prompt"),  // LEGACY column name kept to avoid a migration; mirrors stylePrompt
  genre: text("genre"),             // kept for back-compat; new code uses genreTags
});

// ─────────────────────────────────────────────────────────────────────────────
// lyric_timeline_blocks — Advanced mode: timestamp canvas rows
// ─────────────────────────────────────────────────────────────────────────────
export const lyricTimelineBlocksTable = pgTable("lyric_timeline_blocks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lyricProjectsTable.id, { onDelete: "cascade" }),

  timestampMs: integer("timestamp_ms").notNull().default(0), // e.g. 0, 45000, 135000
  label: text("label").notNull(),         // e.g. "Violin Intro", "Heavy Metal Verse"
  sectionType: text("section_type"),      // intro | verse | chorus | bridge | outro
  sortOrder: integer("sort_order").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// lyric_revisions — snapshot on every save; surgical edits tracked per-line
// ─────────────────────────────────────────────────────────────────────────────
export const lyricRevisionsTable = pgTable("lyric_revisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lyricProjectsTable.id, { onDelete: "cascade" }),

  content: text("content").notNull(),             // full lyrics snapshot at this point
  authorshipScore: integer("authorship_score").default(0),

  // ── Edit classification ───────────────────────────────────────────────────
  editType: text("edit_type"),   // 'full_regen' | 'manual_edit' | 'ai_line_regen' | 'use_as_is'

  // ── Surgical (line-level) context ─────────────────────────────────────────
  lineIndex: integer("line_index"),               // null = whole-song operation
  originalLineText: text("original_line_text"),   // text before this edit
  regenInstruction: text("regen_instruction"),    // user's instruction (surgical remix)

  // ── Legacy ────────────────────────────────────────────────────────────────
  changedLines: jsonb("changed_lines"),           // kept for back-compat

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// lyric_forensic_ledger — immutable audit log; insert-only, never updated
// Every discrete human edit writes one row here
// ─────────────────────────────────────────────────────────────────────────────
export const lyricForensicLedgerTable = pgTable("lyric_forensic_ledger", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lyricProjectsTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),

  editType: text("edit_type").notNull(), // 'manual_edit' | 'ai_line_regen' | 'full_regen' | 'use_as_is'

  // ── What changed ─────────────────────────────────────────────────────────
  lineIndex: integer("line_index"),       // null = whole-song operation
  originalText: text("original_text"),   // exact string before the edit
  newText: text("new_text"),             // exact string after the edit
  regenInstruction: text("regen_instruction"), // user's instruction if surgical remix

  // ── Authorship delta ──────────────────────────────────────────────────────
  levenshteinDelta: integer("levenshtein_delta"),   // chars changed in this edit
  authorshipScoreBefore: integer("authorship_score_before"),
  authorshipScoreAfter: integer("authorship_score_after"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// lyric_imports — user-imported, self-authored lyrics stamped for IP possession.
// One row per import (users may stamp many over time — never overwritten).
// Additive: fully independent of the AI-generated lyric_projects flow.
// ─────────────────────────────────────────────────────────────────────────────
export const lyricImportsTable = pgTable("lyric_imports", {
  id: text("id").primaryKey(),

  // ── Identity ──────────────────────────────────────────────────────────────
  sessionId: text("session_id"),                 // gk_session cookie value at stamp time
  userId: text("user_id"),                        // resolved users.id (OIDC or session-backed)

  // ── Cryptographic possession stamp ────────────────────────────────────────
  contentHash: text("content_hash").notNull(),                    // SHA-256 hex of normalized text
  hashAlgorithm: text("hash_algorithm").notNull().default("sha256"),
  importedText: text("imported_text").notNull(),                  // exact plaintext retained at rest
  charCount: integer("char_count").notNull().default(0),

  // ── Classification ────────────────────────────────────────────────────────
  // Explicitly marks these as fully-human imports, distinct from the AI-collab
  // lyric_projects flow (which is scored, not hash-stamped). Never overlaps.
  stampType: text("stamp_type").notNull().default("imported_human_original"),

  // ── Human-authorship certification ────────────────────────────────────────
  certifiedHumanAuthor: boolean("certified_human_author").notNull().default(false),
  certificationText: text("certification_text"),                  // exact statement the user agreed to

  // ── Timestamps ────────────────────────────────────────────────────────────
  stampedAt: timestamp("stamped_at", { withTimezone: true }).notNull().defaultNow(), // official IP timestamp
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript types
// ─────────────────────────────────────────────────────────────────────────────
export type LyricProject = typeof lyricProjectsTable.$inferSelect;
export type LyricImport = typeof lyricImportsTable.$inferSelect;
export type LyricTimelineBlock = typeof lyricTimelineBlocksTable.$inferSelect;
export type LyricRevision = typeof lyricRevisionsTable.$inferSelect;
export type LyricForensicEntry = typeof lyricForensicLedgerTable.$inferSelect;

export type LineState = {
  id: string;
  type: "section" | "lyric" | "empty";
  text: string;            // current (possibly human-edited) text
  aiOriginal: string;      // original AI output — never mutated after first generation
  isHumanEdited: boolean;
  sectionContext: string;  // e.g. "[Chorus]"
  timestampMs?: number;    // BPM-calculated anchor for teleprompter / .lrc export
};
