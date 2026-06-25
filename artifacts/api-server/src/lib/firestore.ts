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
  is_certified?: boolean;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export function saveSongDraft(
  data: Omit<SongDraftData, "draftId" | "createdAt" | "updatedAt">,
  explicitId?: string,
): string {
  const draftId = explicitId ?? randomUUID();
  const db = getDb();
  if (!db) return draftId;

  const now = new Date().toISOString();
  const doc: SongDraftData = { ...data, draftId, createdAt: now, updatedAt: now };
  // merge so re-saving an existing project id never clobbers fields set by revise.
  db.collection("song_drafts").doc(draftId).set(doc, { merge: true }).catch(() => {});
  return draftId;
}

export function queryLibraryBySession(sessionId: string): Promise<{ songs: SongDraftData[]; jobs: AudioJobData[] }> {
  const db = getDb();
  if (!db) return Promise.resolve({ songs: [], jobs: [] });

  return Promise.all([
    db.collection("song_drafts").where("sessionId", "==", sessionId).limit(50).get(),
    db.collection("audio_jobs").where("sessionId", "==", sessionId).limit(50).get(),
  ]).then(([songsSnap, jobsSnap]) => ({
    songs: songsSnap.docs.map((d) => d.data() as SongDraftData).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    jobs: jobsSnap.docs.map((d) => d.data() as AudioJobData).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })).catch(() => ({ songs: [], jobs: [] }));
}

export function updateSongDraft(
  draftId: string,
  update: Partial<Pick<SongDraftData, "authorshipScore" | "isCopyrightEligible" | "aiDraft" | "is_certified">>
): void {
  const db = getDb();
  if (!db) return;
  // upsert via merge: revise may run before/without a prior draft doc for this id.
  db.collection("song_drafts")
    .doc(draftId)
    .set({ ...update, updatedAt: new Date().toISOString() }, { merge: true })
    .catch(() => {});
}
