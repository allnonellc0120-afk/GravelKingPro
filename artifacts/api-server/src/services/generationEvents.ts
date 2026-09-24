/**
 * Live generation job events.
 *
 * This is a transport fan-out only. PostgreSQL remains the source of truth;
 * callers publish immediately after a durable job update so SSE consumers see
 * the same stage transitions that a status read would return.
 */

export interface GenerationJobEvent {
  jobId: string;
  status?: string;
  stage?: string;
  progress?: number;
  error?: string | null;
  outputObjectKey?: string | null;
  outputUrl?: string | null;
  completedAt?: string | null;
}

type GenerationListener = (event: GenerationJobEvent) => void;

const listeners = new Map<string, Set<GenerationListener>>();

export function subscribeToGenerationJob(
  jobId: string,
  listener: GenerationListener,
): () => void {
  const jobListeners = listeners.get(jobId) ?? new Set<GenerationListener>();
  jobListeners.add(listener);
  listeners.set(jobId, jobListeners);
  return () => {
    jobListeners.delete(listener);
    if (jobListeners.size === 0) listeners.delete(jobId);
  };
}

export function publishGenerationJobEvent(event: GenerationJobEvent): void {
  for (const listener of listeners.get(event.jobId) ?? []) {
    try {
      listener(event);
    } catch {
      // A disconnected SSE response must not interrupt a pipeline transition.
    }
  }
}