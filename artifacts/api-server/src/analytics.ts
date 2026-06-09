import { db, analyticsEventsTable } from "@workspace/db";

export type AnalyticsEventType =
  | "pageview"
  | "checkout_started"
  | "subscription_activated";

export interface RecordEventInput {
  type: AnalyticsEventType;
  visitorId?: string | null;
  sessionId?: string | null;
  path?: string | null;
  referrer?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert a single analytics event. Callers should treat this as best-effort and
 * never let a failure break the user-facing request (wrap in `.catch`).
 */
export async function recordAnalyticsEvent(input: RecordEventInput): Promise<void> {
  await db.insert(analyticsEventsTable).values({
    type: input.type,
    visitorId: input.visitorId ?? null,
    sessionId: input.sessionId ?? null,
    path: input.path ?? null,
    referrer: input.referrer ?? null,
    metadata: input.metadata ?? null,
  });
}
