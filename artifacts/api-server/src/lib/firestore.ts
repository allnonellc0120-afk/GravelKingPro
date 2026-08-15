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
  // Firestore rejects documents containing `undefined` values outright — strip
  // absent optional fields (genre, storyPrompt, …) instead of erroring the save.
  const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
  // merge so re-saving an existing project id never clobbers fields set by revise.
  db.collection("song_drafts").doc(draftId).set(clean, { merge: true }).catch(() => {});
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

// ── ip_cert_stubs — dual backup (court-subpoenable) ──────────────────────────
//
// Every mastered track's cert stub is written here to Google Firestore
// IN ADDITION TO the local Postgres DB. Firestore is Google-operated
// infrastructure, independently accessible via court subpoena even if
// GravelKing's own servers are unavailable or the company closes.
//
// Collection: "gk_cert_stubs"
// Document ID: certId (UUID embedded in the track watermark)

export interface CertStubBackup {
  certId:               string;
  denominator:          string;   // server half of the split hash
  handshake:            string;   // HMAC — only GK server can regenerate
  contentHash:          string;   // SHA-256 of pre-MLK audio
  artist:               string;
  stylePrompt:          string | null;
  styleAuthorshipScore: number | null;
  certifiedAt:          string;   // ISO timestamp — legal creation record
  backupNote:           string;   // human-readable legal context
}

/**
 * Fire-and-forget Firestore backup of a cert stub.
 * Never throws — failure is logged but never blocks the mastering response.
 * The local Postgres DB is the primary source of truth; Firestore is the
 * independently-subpoenable court-accessible replica.
 */
export function backupCertStub(stub: Omit<CertStubBackup, "backupNote">): void {
  const db = getDb();
  if (!db) return;

  const doc: CertStubBackup = {
    ...stub,
    backupNote:
      "GravelKing IP Certificate — dual-stored for independent legal verification. " +
      "This record on Google Cloud Firestore serves as a tamper-evident, " +
      "court-subpoenable backup of the server-side denominator. " +
      "Verification requires this record plus the nominator embedded in the audio file. " +
      "Neither half alone constitutes proof of ownership.",
  };

  db.collection("gk_cert_stubs")
    .doc(stub.certId)
    .set(doc)
    .catch((err) => {
      // Non-fatal — Postgres is the primary store
      console.error("[firestore] cert backup failed:", err?.message ?? err);
    });
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
