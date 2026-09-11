import { db, investorProspectsTable, investorTouchesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendGmail } from "./gmail";
import { logger } from "./logger";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 20_000;
const MAX_ATTEMPTS = 3;

type ClaimedTouch = {
  id: string;
  prospect_id: string;
  touch_number: number;
  recipient_email: string;
  subject: string;
  body: string;
  attempts: number;
};

export type OutreachDispatchResult = {
  claimed: number;
  sent: number;
  failed: number;
};

export async function dispatchDueInvestorOutreach(limit = 25): Promise<OutreachDispatchResult> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const claimedResult = await db.execute(sql`
    WITH candidates AS (
      SELECT t.id
      FROM investor_touches t
      JOIN investor_prospects p ON p.id = t.prospect_id
      WHERE t.dispatch_status = 'queued'
        AND t.scheduled_at IS NOT NULL
        AND t.scheduled_at <= now()
        AND t.recipient_email IS NOT NULL
        AND t.subject IS NOT NULL
        AND t.body IS NOT NULL
        AND p.status NOT IN ('responded', 'meeting_booked', 'passed', 'closed')
      ORDER BY t.scheduled_at ASC
      FOR UPDATE OF t SKIP LOCKED
      LIMIT ${safeLimit}
    )
    UPDATE investor_touches t
    SET dispatch_status = 'sending',
        attempts = t.attempts + 1,
        updated_at = now()
    FROM candidates c
    WHERE t.id = c.id
    RETURNING t.id, t.prospect_id, t.touch_number, t.recipient_email,
              t.subject, t.body, t.attempts
  `);

  const claimed = claimedResult.rows as ClaimedTouch[];
  let sent = 0;
  let failed = 0;

  for (const touch of claimed) {
    const delivered = await sendGmail({
      to: touch.recipient_email,
      subject: touch.subject,
      text: touch.body,
    });

    if (delivered) {
      sent += 1;
      await db
        .update(investorTouchesTable)
        .set({
          dispatchStatus: "sent",
          sentAt: new Date().toISOString().slice(0, 10),
          dispatchedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(investorTouchesTable.id, touch.id));
      await db
        .update(investorProspectsTable)
        .set({
          status: `touch_${touch.touch_number}_sent`,
          updatedAt: new Date(),
        })
        .where(eq(investorProspectsTable.id, touch.prospect_id));
    } else {
      failed += 1;
      const retry = touch.attempts < MAX_ATTEMPTS;
      await db
        .update(investorTouchesTable)
        .set({
          dispatchStatus: retry ? "queued" : "failed",
          scheduledAt: retry ? new Date(Date.now() + 15 * 60 * 1000) : new Date(),
          lastError: retry ? "Delivery failed; retry scheduled." : "Delivery failed after maximum attempts.",
          updatedAt: new Date(),
        })
        .where(eq(investorTouchesTable.id, touch.id));
    }
  }

  if (claimed.length > 0) {
    logger.info({ claimed: claimed.length, sent, failed }, "[investorOutreach] Due outreach sweep complete");
  }
  return { claimed: claimed.length, sent, failed };
}

export function scheduleInvestorOutreachDispatcher(): void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchDueInvestorOutreach();
    } catch (err) {
      logger.error({ err }, "[investorOutreach] Scheduled sweep failed");
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void sweep();
    setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
  logger.info("[investorOutreach] Five-minute dispatcher registered");
}