/**
 * In-memory Live Activity Monitor. Tracks the last tool touched per session
 * so the admin dashboard can show who is doing what, right now. Intentionally
 * not persisted — this is a live snapshot, not an audit log (that's errorTracker.ts).
 */
type ActivityEntry = {
  sessionId: string;
  tool: string;
  timestamp: number;
};

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // treat a session as "active" for 5 minutes after last touch
const activity = new Map<string, ActivityEntry>();

export function recordActivity(sessionId: string | undefined | null, tool: string): void {
  if (!sessionId) return;
  activity.set(sessionId, { sessionId, tool, timestamp: Date.now() });
}

export function getActiveSessions(): ActivityEntry[] {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const result: ActivityEntry[] = [];
  for (const [id, entry] of activity) {
    if (entry.timestamp < cutoff) {
      activity.delete(id);
      continue;
    }
    result.push(entry);
  }
  return result.sort((a, b) => b.timestamp - a.timestamp);
}
