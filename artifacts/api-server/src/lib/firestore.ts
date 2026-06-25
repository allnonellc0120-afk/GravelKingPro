import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "crypto";

let _db: Firestore | null = null;

function getDb(): Firestore | null {
  if (_db) return _db;

  const raw = process.env["GCP_SERVICE_ACCOUNT"];
  if (!raw) return null;

  try {
    const credentials = JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };

    _db = new Firestore({
      projectId: credentials.project_id,
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
    });

    return _db;
  } catch {
    return null;
  }
}

// ── audio_jobs ────────────────────────────────────────────────────────────────

export interface AudioJobData {
  jobId: string;
  sessionId?: string;
  fileName: string;
  mode: string;
  tier: string;
  status: string;
  stack?: string;
  model?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export function createAudioJob(data: Omit<AudioJobData, "jobId" | "createdAt">): string {
  const jobId = randomUUID();
  const db = getDb();
  if (!db) return jobId;

  const doc: AudioJobData = { ...data, jobId, createdAt: new Date().toISOString() };
  db.collection("audio_jobs").doc(jobId).set(doc).catch(() => {});
  return jobId;
}

export function completeAudioJob(
  jobId: string,
  update: Partial<Pick<AudioJobData, "status" | "stack" | "model" | "errorMessage">>
): void {
  const db = getDb();
  if (!db) return;
  db.collection("audio_jobs")
    .doc(jobId)
    .update({ ...update, completedAt: new Date().toISOString() })
    .catch(() => {});
}

// ── song_drafts ───────────────────────────────────────────────────────────────

export interface SongDraftData {
  draftId: string;
  sessionId?: string;
  projectId?: string;
  mode: string;
  genre?: string;
  storyPrompt?: string;
  aiDraft: string;
  stylePrompt?: string;
  authorshipScore: number;
  isCopyrightEligible: boolean;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export function saveSongDraft(
  data: Omit<SongDraftData, "draftId" | "createdAt" | "updatedAt">
): string {
  const draftId = randomUUID();
  const db = getDb();
  if (!db) return draftId;

  const now = new Date().toISOString();
  const doc: SongDraftData = { ...data, draftId, createdAt: now, updatedAt: now };
  db.collection("song_drafts").doc(draftId).set(doc).catch(() => {});
  return draftId;
}

export function updateSongDraft(
  draftId: string,
  update: Partial<Pick<SongDraftData, "authorshipScore" | "isCopyrightEligible" | "aiDraft">>
): void {
  const db = getDb();
  if (!db) return;
  db.collection("song_drafts")
    .doc(draftId)
    .update({ ...update, updatedAt: new Date().toISOString() })
    .catch(() => {});
}
