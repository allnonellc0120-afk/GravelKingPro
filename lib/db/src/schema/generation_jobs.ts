import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Public async audio pipeline state. The existing jobs table remains the
 * internal mastering record; this table is the stable client-facing contract.
 */
export const generationJobsTable = pgTable("generation_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: text("user_id").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  currentStage: integer("current_stage").notNull().default(1),
  progressPercent: integer("progress_percent").notNull().default(0),
  lyrics: text("lyrics"),
  stylePrompt: text("style_prompt"),
  originalAudioUrl: text("original_audio_url"),
  demucsVocalUrl: text("demucs_vocal_url"),
  demucsInstrumentalUrl: text("demucs_instrumental_url"),
  rvcVocalUrl: text("rvc_vocal_url"),
  finalMasterWavUrl: text("final_master_wav_url"),
  finalMasterMp3Url: text("final_master_mp3_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GenerationJob = typeof generationJobsTable.$inferSelect;
export type InsertGenerationJob = typeof generationJobsTable.$inferInsert;