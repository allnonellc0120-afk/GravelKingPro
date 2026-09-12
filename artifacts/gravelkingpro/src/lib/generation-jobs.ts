/**
 * GKA async generation client.
 *
 * Implements the frontend contract for the middle-tier worker:
 *  - POST /api/tracks/generate | /api/tracks/remix → { jobId, status: "processing" } (<500ms ACK)
 *  - Poll GET /api/tracks/:jobId/status until ready | failed
 *  - In-flight jobs are cached in sessionStorage so a re-render or accidental
 *    double-submit resumes the SAME job instead of spending credits twice.
 */

export type GenerationJobStatus = "queued" | "processing" | "ready" | "failed";

export interface GenerationJobState {
  status: GenerationJobStatus;
  jobId: string;
  stage?: string;
  progress?: number;
  trackId?: string | null;
  streamUrl?: string | null;
  error?: string;
}

const JOB_CACHE_PREFIX = "gka:genjob:";
const POLL_INTERVAL_MS = 2_500;
const POLL_TIMEOUT_MS = 15 * 60_000;

function cacheKey(kind: "generate" | "remix", dedupeKey: string): string {
  return `${JOB_CACHE_PREFIX}${kind}:${dedupeKey}`;
}

function readCachedJobId(kind: "generate" | "remix", dedupeKey: string): string | null {
  try {
    return sessionStorage.getItem(cacheKey(kind, dedupeKey));
  } catch {
    return null;
  }
}

function writeCachedJobId(kind: "generate" | "remix", dedupeKey: string, jobId: string): void {
  try {
    sessionStorage.setItem(cacheKey(kind, dedupeKey), jobId);
  } catch {
    // Cache is an optimization — storage failures must never block generation.
  }
}

export function clearCachedJob(kind: "generate" | "remix", dedupeKey: string): void {
  try {
    sessionStorage.removeItem(cacheKey(kind, dedupeKey));
  } catch {
    // ignore
  }
}

async function fetchJobStatus(jobId: string): Promise<GenerationJobState> {
  const res = await fetch(`/api/tracks/${encodeURIComponent(jobId)}/status`, {
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as GenerationJobState & { error?: string };
  if (!res.ok) throw new Error(data.error || `Status check failed (HTTP ${res.status})`);
  return data;
}

async function pollJob(
  jobId: string,
  onProgress?: (state: GenerationJobState) => void,
): Promise<GenerationJobState> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const state = await fetchJobStatus(jobId);
    onProgress?.(state);
    if (state.status === "ready") return state;
    if (state.status === "failed") {
      throw new Error(state.error || "Generation failed.");
    }
    if (Date.now() > deadline) {
      throw new Error("Generation is taking longer than expected — check your Library shortly.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export interface SubmitGenerationOptions {
  kind: "generate" | "remix";
  /** Stable key identifying this logical request (e.g. lyric hash or parent track id + twist). */
  dedupeKey: string;
  body: Record<string, unknown>;
  onProgress?: (state: GenerationJobState) => void;
}

/**
 * Submit (or resume) a generation/remix job and wait for completion.
 * If a job for the same dedupeKey is already in flight, we reattach to it
 * instead of creating a duplicate paid run.
 */
export async function submitGenerationJob(opts: SubmitGenerationOptions): Promise<GenerationJobState> {
  const cached = readCachedJobId(opts.kind, opts.dedupeKey);
  if (cached) {
    try {
      const state = await pollJob(cached, opts.onProgress);
      clearCachedJob(opts.kind, opts.dedupeKey);
      return state;
    } catch {
      // Cached job failed or expired — fall through to a fresh submit.
      clearCachedJob(opts.kind, opts.dedupeKey);
    }
  }

  const path = opts.kind === "generate" ? "/api/tracks/generate" : "/api/tracks/remix";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    jobId?: string;
    status?: "queued" | "processing";
    error?: string;
    code?: string;
  };
  if (!res.ok || !data.jobId) {
    const err = new Error(data.error || `Generation request failed (HTTP ${res.status})`);
    (err as Error & { code?: string }).code = data.code;
    throw err;
  }

  writeCachedJobId(opts.kind, opts.dedupeKey, data.jobId);
  opts.onProgress?.({ status: data.status === "queued" ? "queued" : "processing", jobId: data.jobId });
  try {
    const state = await pollJob(data.jobId, opts.onProgress);
    clearCachedJob(opts.kind, opts.dedupeKey);
    return state;
  } catch (err) {
    clearCachedJob(opts.kind, opts.dedupeKey);
    throw err;
  }
}
