/**
 * Investor outreach overdue alert.
 *
 * Cadence rules (from the playbook):
 *   T2 overdue: T1 sent ≥ 5 days ago AND T2 not yet sent
 *   T3 overdue: T1 sent ≥ 12 days ago AND T3 not yet sent
 *
 * Sends a single summary email to the admin Gmail account.
 * Uses a DB table to track the last send time so restarts don't spam.
 */
import { db, investorProspectsTable, investorTouchesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { sendGmail, getGmailAddress } from "./gmail";
import { logger } from "./logger";

const T2_DAYS = 5;
const T3_DAYS = 12;

// Minimum gap between alert emails (23 hours — allows daily cadence without
// clock drift slowly pushing the window past midnight).
const MIN_ALERT_GAP_MS = 23 * 60 * 60 * 1000;

interface OverdueEntry {
  prospectName: string;
  daysSinceT1: number;
  overdueTouch: 2 | 3;
  t1SentAt: string;
}

/**
 * Ensure the alert_log table exists (idempotent).
 */
async function ensureAlertLogTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS investor_alert_log (
      key          text        PRIMARY KEY,
      sent_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Returns true if an alert was already sent within MIN_ALERT_GAP_MS.
 */
async function recentlySent(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      SELECT sent_at FROM investor_alert_log WHERE key = 'overdue'
    `);
    const sentAt = rows.rows[0]?.sent_at as Date | undefined;
    if (!sentAt) return false;
    return Date.now() - new Date(sentAt).getTime() < MIN_ALERT_GAP_MS;
  } catch {
    return false;
  }
}

/**
 * Record that an alert was just sent.
 */
async function recordSend(): Promise<void> {
  await db.execute(sql`
    INSERT INTO investor_alert_log (key, sent_at)
    VALUES ('overdue', now())
    ON CONFLICT (key) DO UPDATE SET sent_at = now()
  `);
}

/**
 * Core check: returns an array of overdue entries across all prospects.
 */
export async function findOverdueTouches(): Promise<OverdueEntry[]> {
  const prospects = await db
    .select()
    .from(investorProspectsTable)
    .orderBy(asc(investorProspectsTable.sortOrder));

  const touches = await db
    .select()
    .from(investorTouchesTable)
    .orderBy(asc(investorTouchesTable.touchNumber));

  // Group by prospect
  const touchMap: Record<string, typeof touches> = {};
  for (const t of touches) {
    if (!touchMap[t.prospectId]) touchMap[t.prospectId] = [];
    touchMap[t.prospectId].push(t);
  }

  const overdue: OverdueEntry[] = [];
  const now = Date.now();

  for (const prospect of prospects) {
    // Skip prospects that have been terminated or closed
    const terminalStatuses = new Set(["passed", "closed"]);
    if (terminalStatuses.has(prospect.status)) continue;

    const prospectTouches = touchMap[prospect.id] ?? [];
    const byNumber: Record<number, (typeof touches)[number]> = {};
    for (const t of prospectTouches) byNumber[t.touchNumber] = t;

    const t1 = byNumber[1];
    // Need T1 to have been sent to compute overdue windows
    if (!t1?.sentAt) continue;

    // sentAt is stored as a date string "YYYY-MM-DD"
    const t1Date = new Date(t1.sentAt);
    if (isNaN(t1Date.getTime())) continue;
    const daysSinceT1 = Math.floor((now - t1Date.getTime()) / (1000 * 60 * 60 * 24));

    // T2 overdue?
    const t2 = byNumber[2];
    if (!t2?.sentAt && daysSinceT1 >= T2_DAYS) {
      overdue.push({
        prospectName: prospect.name,
        daysSinceT1,
        overdueTouch: 2,
        t1SentAt: t1.sentAt,
      });
    }

    // T3 overdue? (only if T2 was sent)
    const t3 = byNumber[3];
    if (t2?.sentAt && !t3?.sentAt && daysSinceT1 >= T3_DAYS) {
      overdue.push({
        prospectName: prospect.name,
        daysSinceT1,
        overdueTouch: 3,
        t1SentAt: t1.sentAt,
      });
    }
  }

  return overdue;
}

/**
 * Build the plain-text alert email body.
 */
function buildEmailBody(overdue: OverdueEntry[]): string {
  const lines: string[] = [
    "GravelKingPro — Investor Touch Overdue Alert",
    "=".repeat(50),
    "",
    `${overdue.length} prospect(s) need a follow-up touch:`,
    "",
  ];

  for (const entry of overdue) {
    const action =
      entry.overdueTouch === 2
        ? `Send Touch 2 (T1 was ${entry.daysSinceT1} days ago — due after ${T2_DAYS}d)`
        : `Send Touch 3 (T1 was ${entry.daysSinceT1} days ago — due after ${T3_DAYS}d)`;

    lines.push(`• ${entry.prospectName}`);
    lines.push(`  Action needed: ${action}`);
    lines.push(`  T1 sent: ${entry.t1SentAt}`);
    lines.push("");
  }

  lines.push("-".repeat(50));
  lines.push("Open the admin investor tracker to send the overdue touches.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Run the overdue check and email the admin if anything is overdue.
 * Returns a summary object for the manual-trigger endpoint.
 *
 * @param force - skip the 23-hour dedup guard (for manual triggers)
 */
export async function runOverdueAlertCheck(force = false): Promise<{
  overdue: OverdueEntry[];
  emailSent: boolean;
  skippedRecentSend: boolean;
}> {
  await ensureAlertLogTable();

  const overdue = await findOverdueTouches();

  if (overdue.length === 0) {
    logger.info("[investorAlerts] No overdue touches — nothing to send");
    return { overdue, emailSent: false, skippedRecentSend: false };
  }

  if (!force) {
    const alreadySent = await recentlySent();
    if (alreadySent) {
      logger.info("[investorAlerts] Alert sent recently — skipping to avoid duplicate");
      return { overdue, emailSent: false, skippedRecentSend: true };
    }
  }

  const adminAddress = await getGmailAddress();
  if (!adminAddress) {
    logger.error("[investorAlerts] Cannot resolve Gmail address — email not sent");
    return { overdue, emailSent: false, skippedRecentSend: false };
  }

  const subject = `[ACTION NEEDED] ${overdue.length} investor touch(es) overdue`;
  const text = buildEmailBody(overdue);

  const sent = await sendGmail({ to: adminAddress, subject, text });

  if (sent) {
    await recordSend();
    logger.info({ count: overdue.length }, "[investorAlerts] Overdue alert email sent");
  } else {
    logger.error("[investorAlerts] Failed to send overdue alert email");
  }

  return { overdue, emailSent: sent, skippedRecentSend: false };
}

/**
 * Schedule a daily overdue check. Call once on server startup.
 * Fires immediately after a short delay (lets the DB settle), then every 24 h.
 */
export function scheduleOverdueAlerts(): void {
  const INITIAL_DELAY_MS = 30_000; // 30 s after startup
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  setTimeout(() => {
    // Initial check
    runOverdueAlertCheck().catch((err: unknown) =>
      logger.error({ err }, "[investorAlerts] Scheduled check failed"),
    );

    // Recurring daily check
    setInterval(() => {
      runOverdueAlertCheck().catch((err: unknown) =>
        logger.error({ err }, "[investorAlerts] Scheduled check failed"),
      );
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  logger.info("[investorAlerts] Daily overdue-alert scheduler registered");
}
