/**
 * Unit tests for investorAlerts.ts
 *
 * Tests the core logic of findOverdueTouches() and the 23-hour dedup guard
 * in runOverdueAlertCheck(), without touching email sending.
 *
 * Covers:
 *   [1] findOverdueTouches: T2 alert fires at exactly day 5 (≥ T2_DAYS)
 *   [2] findOverdueTouches: T2 does NOT fire at day 4 (< T2_DAYS)
 *   [3] findOverdueTouches: T3 fires at day 12 when T2 has been sent
 *   [4] findOverdueTouches: T3 does NOT fire when T2 has not been sent (only T2 fires)
 *   [5] findOverdueTouches: no alert for terminal statuses (passed, closed)
 *   [6] runOverdueAlertCheck(force=false): skips send if alert was sent within 23 h
 */
import { randomUUID } from "node:crypto";
import { db, investorProspectsTable, investorTouchesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { findOverdueTouches, runOverdueAlertCheck } from "../lib/investorAlerts";

// ── Assertion harness ─────────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a YYYY-MM-DD string for N days before today (UTC). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const seededProspectIds: string[] = [];
let sortOrderCounter = 99900; // High values to avoid conflicts with real data

async function seedProspect(status: string = "touch_1_sent"): Promise<string> {
  sortOrderCounter++;
  const [row] = await db
    .insert(investorProspectsTable)
    .values({
      id: randomUUID(),
      sortOrder: sortOrderCounter,
      name: `Test Prospect ${sortOrderCounter}`,
      status,
    })
    .returning({ id: investorProspectsTable.id });
  seededProspectIds.push(row.id);
  return row.id;
}

async function seedTouch(
  prospectId: string,
  touchNumber: number,
  sentAt: string | null = null,
): Promise<void> {
  await db.insert(investorTouchesTable).values({
    id: randomUUID(),
    prospectId,
    touchNumber,
    sentAt,
  });
}

// ── Dedup-log helpers (read → stamp → restore, never unconditional delete) ────

interface AlertLogRow {
  sentAt: Date;
}

/**
 * Ensure the alert_log table exists and read the current overdue row (if any).
 * Call this BEFORE stampRecentSend() and save the result for restoreAlertLog().
 */
async function ensureAndReadAlertLog(): Promise<AlertLogRow | null> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS investor_alert_log (
      key          text        PRIMARY KEY,
      sent_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  const rows = await db.execute(sql`
    SELECT sent_at FROM investor_alert_log WHERE key = 'overdue'
  `);
  const row = rows.rows[0] as { sent_at: Date } | undefined;
  return row ? { sentAt: new Date(row.sent_at) } : null;
}

/**
 * Overwrite the overdue row with sent_at = NOW() to simulate a recent send.
 */
async function stampRecentSend(): Promise<void> {
  await db.execute(sql`
    INSERT INTO investor_alert_log (key, sent_at)
    VALUES ('overdue', now())
    ON CONFLICT (key) DO UPDATE SET sent_at = now()
  `);
}

/**
 * Restore the overdue row to its original state.
 * - If there was no prior row: delete the test row we inserted.
 * - If there was a prior row: restore its exact timestamp.
 */
async function restoreAlertLog(prior: AlertLogRow | null): Promise<void> {
  if (prior === null) {
    await db.execute(sql`DELETE FROM investor_alert_log WHERE key = 'overdue'`);
  } else {
    await db.execute(sql`
      INSERT INTO investor_alert_log (key, sent_at)
      VALUES ('overdue', ${prior.sentAt.toISOString()})
      ON CONFLICT (key) DO UPDATE SET sent_at = ${prior.sentAt.toISOString()}
    `);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Capture pre-test dedup state once; restored in finally.
  const priorAlertLog = await ensureAndReadAlertLog();
  // Start with a clean slate for dedup so prospect-only tests aren't skipped.
  await db.execute(sql`DELETE FROM investor_alert_log WHERE key = 'overdue'`);

  try {
    // ── [1] T2 fires at exactly day 5 ─────────────────────────────────────────
    console.log("\n[1] T2 fires at exactly day 5");
    {
      const pid = await seedProspect("touch_1_sent");
      await seedTouch(pid, 1, daysAgo(5)); // T1 sent 5 days ago, no T2

      const overdue = await findOverdueTouches();
      const entry = overdue.find((e) => e.prospectName === `Test Prospect ${sortOrderCounter}`);
      check("T2 entry present at day 5", !!entry, JSON.stringify(overdue));
      check("overdueTouch is 2", entry?.overdueTouch === 2, `got ${entry?.overdueTouch}`);
      check("daysSinceT1 is 5", entry?.daysSinceT1 === 5, `got ${entry?.daysSinceT1}`);
    }

    // ── [2] T2 does NOT fire at day 4 ─────────────────────────────────────────
    console.log("\n[2] T2 does NOT fire at day 4 (below threshold)");
    {
      const pid = await seedProspect("touch_1_sent");
      await seedTouch(pid, 1, daysAgo(4)); // T1 sent 4 days ago, no T2

      const overdue = await findOverdueTouches();
      const entry = overdue.find((e) => e.prospectName === `Test Prospect ${sortOrderCounter}`);
      check("No T2 entry at day 4", !entry, `unexpected: ${JSON.stringify(entry)}`);
    }

    // ── [3] T3 fires at day 12 when T2 has been sent ──────────────────────────
    console.log("\n[3] T3 fires at day 12 when T2 has been sent");
    {
      const pid = await seedProspect("touch_2_sent");
      await seedTouch(pid, 1, daysAgo(12)); // T1 sent 12 days ago
      await seedTouch(pid, 2, daysAgo(7)); // T2 sent 7 days ago, no T3

      const overdue = await findOverdueTouches();
      const entry = overdue.find((e) => e.prospectName === `Test Prospect ${sortOrderCounter}`);
      check("T3 entry present at day 12 with T2 sent", !!entry, JSON.stringify(overdue));
      check("overdueTouch is 3", entry?.overdueTouch === 3, `got ${entry?.overdueTouch}`);
      check("daysSinceT1 is 12", entry?.daysSinceT1 === 12, `got ${entry?.daysSinceT1}`);
    }

    // ── [4] T3 does NOT fire when T2 has not been sent (only T2 fires) ────────
    console.log("\n[4] T3 does NOT fire when T2 unsent (T2 fires instead)");
    {
      const pid = await seedProspect("touch_1_sent");
      await seedTouch(pid, 1, daysAgo(14)); // T1 sent 14 days ago
      await seedTouch(pid, 2, null); // T2 exists but not sent; no T3

      const overdue = await findOverdueTouches();
      const entries = overdue.filter((e) => e.prospectName === `Test Prospect ${sortOrderCounter}`);
      const t2Entry = entries.find((e) => e.overdueTouch === 2);
      const t3Entry = entries.find((e) => e.overdueTouch === 3);
      check("T2 fires when T2 unsent at day 14", !!t2Entry, JSON.stringify(entries));
      check("T3 does NOT fire when T2 unsent", !t3Entry, `unexpected: ${JSON.stringify(t3Entry)}`);
    }

    // ── [5] No alert for terminal statuses ────────────────────────────────────
    console.log("\n[5] No alert for terminal statuses (passed, closed)");
    {
      const passedId = await seedProspect("passed");
      await seedTouch(passedId, 1, daysAgo(10));
      const passedName = `Test Prospect ${sortOrderCounter}`;

      const closedId = await seedProspect("closed");
      await seedTouch(closedId, 1, daysAgo(10));
      const closedName = `Test Prospect ${sortOrderCounter}`;

      const overdue = await findOverdueTouches();
      const passedEntry = overdue.find((e) => e.prospectName === passedName);
      const closedEntry = overdue.find((e) => e.prospectName === closedName);
      check("No alert for 'passed' status", !passedEntry, `unexpected: ${JSON.stringify(passedEntry)}`);
      check("No alert for 'closed' status", !closedEntry, `unexpected: ${JSON.stringify(closedEntry)}`);
    }

    // ── [6] runOverdueAlertCheck(force=false) skips when recently sent ────────
    // Stamp a fresh send time, run the check, then restore via finally.
    console.log("\n[6] runOverdueAlertCheck skips if alert sent within 23 h");
    {
      await stampRecentSend();

      // Seed an overdue prospect so the function would want to send
      const pid = await seedProspect("touch_1_sent");
      await seedTouch(pid, 1, daysAgo(7));

      const result = await runOverdueAlertCheck(false);
      check("skippedRecentSend is true", result.skippedRecentSend === true, JSON.stringify(result));
      check("emailSent is false", result.emailSent === false, JSON.stringify(result));
      check("overdue list is still populated", result.overdue.length > 0, JSON.stringify(result));
    }
  } finally {
    // Restore the alert log to exactly what it was before this test ran.
    await restoreAlertLog(priorAlertLog);

    // Remove all seeded prospects (touches cascade-delete via FK).
    if (seededProspectIds.length > 0) {
      await db
        .delete(investorProspectsTable)
        .where(inArray(investorProspectsTable.id, seededProspectIds));
    }
  }

  console.log(`\ninvestor-alerts.test: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("Failures:", failures);
    process.exitCode = 1;
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
