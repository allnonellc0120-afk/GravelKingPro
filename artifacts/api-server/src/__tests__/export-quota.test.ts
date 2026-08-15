/**
 * Integration test: the rolling 30-day export cap (20 WAV/MP3 exports) cannot
 * be exceeded by simultaneous downloads.
 *
 * Runs the real Express `app` in-process and fires PARALLEL requests against
 * quota-consuming routes (/api/convert, /api/kernel/process-audio) with seeded
 * users. Asserts:
 *   [1] fresh window (export_period_start NULL): 25 concurrent requests across
 *       routes → at most 20 succeed, exactly one reset (monthly_exports equals
 *       the success count — a double reset would lose increments)
 *   [2] 19→20 boundary: 5 concurrent requests → exactly 1 succeeds, then 429
 *   [3] expired window: 6 concurrent requests all succeed with exactly one
 *       reset (monthly_exports == 6, fresh export_period_start)
 *   [4] isDeveloper bypass: succeeds at cap, counter untouched
 *   [5] flac/m4a conversions are NOT counted and NOT blocked at cap
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink, readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import app from "../app";
import { EXPORT_LIMIT } from "../lib/exportQuota";
import { db, usersTable, sessionsTable, processRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// ── Tiny assertion harness ────────────────────────────────────────────────────
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
async function makeTrueStereoWav(seconds = 1): Promise<Buffer> {
  // Distinct L/R so MLK v3 center-cancel never nulls the signal.
  const out = `/tmp/gk_quota_stereo_${randomUUID()}.wav`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=523:duration=${seconds}`,
    "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]",
    "-map", "[a]", "-acodec", "pcm_s16le", "-ar", "44100", out,
  ], { timeout: 30_000 });
  const buf = await readFile(out);
  await unlink(out).catch(() => {});
  return buf;
}

function buildForm(
  fields: Record<string, string>,
  files: Array<{ field: string; name: string; type: string; buf: Buffer }>,
): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) {
    fd.append(f.field, new Blob([new Uint8Array(f.buf)], { type: f.type }), f.name);
  }
  return fd;
}

interface SeededUser {
  userId: string;
  sid: string;
  auth: { Authorization: string };
}

const seeded: SeededUser[] = [];

async function seedUser(opts: {
  monthlyExports?: number;
  exportPeriodStart?: Date | null;
  isDeveloper?: boolean;
}): Promise<SeededUser> {
  const userId = `test-quota-${randomUUID()}`;
  const sid = randomBytes(32).toString("hex");
  await db.insert(usersTable).values({
    id: userId,
    email: `${userId}@example.test`,
    subscriptionTier: "monthly",
    monthlyExports: opts.monthlyExports ?? 0,
    exportPeriodStart: opts.exportPeriodStart ?? null,
    isDeveloper: opts.isDeveloper ?? false,
  });
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: { id: userId, subscriptionTier: "monthly" },
      access_token: "test-access-token",
    },
    expire: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const u = { userId, sid, auth: { Authorization: `Bearer ${sid}` } };
  seeded.push(u);
  return u;
}

async function readUserRow(userId: string) {
  const [row] = await db
    .select({
      monthlyExports: usersTable.monthlyExports,
      exportPeriodStart: usersTable.exportPeriodStart,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return row;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const appServer = http.createServer(app);

  try {
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const apiPort = (appServer.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${apiPort}`;

    const stereoWav = await makeTrueStereoWav(1);

    const convertReq = (auth: { Authorization: string }, format: string) =>
      fetch(`${base}/api/convert`, {
        method: "POST",
        headers: auth,
        body: buildForm({ format }, [
          { field: "file", name: "in.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });

    const processAudioReq = (auth: { Authorization: string }) =>
      fetch(`${base}/api/kernel/process-audio`, {
        method: "POST",
        headers: auth,
        body: buildForm({ mode: "standard", author_assertion: "true" }, [
          { field: "audio", name: "in.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });

    // ── [1] Fresh window: 25 concurrent requests across routes → ≤ 20 succeed ──
    console.log("\n[1] Fresh window (NULL export_period_start): 25 concurrent across routes");
    {
      const user = await seedUser({ monthlyExports: 7, exportPeriodStart: null });
      // 22 cheap conversions + 3 real kernel runs — cross-route concurrency.
      const burst: Promise<{ route: string; res: Response }>[] = [];
      for (let i = 0; i < 22; i++) {
        burst.push(convertReq(user.auth, i % 2 ? "mp3" : "wav").then((res) => ({ route: "convert", res })));
      }
      for (let i = 0; i < 3; i++) {
        burst.push(processAudioReq(user.auth).then((res) => ({ route: "process-audio", res })));
      }
      const results = (await Promise.all(burst)).map((r) => r.res);
      const routes = (await Promise.all(burst)).map((r) => r.route);

      const ok = results.filter((r) => r.status === 200).length;
      const capped = results.filter((r) => r.status === 429).length;
      // The kernel route has its own concurrency limiter (503) — that's a
      // legitimate non-quota rejection under a parallel burst, but ONLY for
      // process-audio; conversions must never see anything but 200/429.
      const other = results.filter(
        (r, i) => r.status !== 200 && r.status !== 429 &&
          !(r.status === 503 && routes[i] === "process-audio"),
      ).length;
      check(`fresh window: at most ${EXPORT_LIMIT} of 25 succeed`, ok <= EXPORT_LIMIT, `ok=${ok}`);
      check(
        "fresh window: rejections are 429 (or kernel-limiter 503)",
        other === 0,
        `ok=${ok} 429=${capped} statuses=${results.map((r) => r.status).join(",")}`,
      );
      // With 25 attempts, all cap slots should be used unless a request failed
      // for non-quota reasons (other === 0 above guards that).
      check(`fresh window: exactly ${EXPORT_LIMIT} succeed`, ok === EXPORT_LIMIT, `ok=${ok}`);

      const row = await readUserRow(user.userId);
      check("fresh window: export_period_start was set", !!row?.exportPeriodStart);
      // Exactly ONE reset: a second concurrent reset would overwrite counts
      // and leave monthly_exports below the number of successful exports.
      check(
        "fresh window: monthly_exports equals success count (single reset)",
        row?.monthlyExports === ok,
        `monthly_exports=${row?.monthlyExports} ok=${ok}`,
      );
      // A drained follow-up request must be rejected.
      const after = await convertReq(user.auth, "mp3");
      check("fresh window: next request after cap → 429", after.status === 429, `got ${after.status}`);
      const body = (await after.json().catch(() => ({}))) as { code?: string };
      check("fresh window: 429 code EXPORT_LIMIT_REACHED", body?.code === "EXPORT_LIMIT_REACHED", JSON.stringify(body));
    }

    // ── [2] 19→20 boundary under concurrency ──────────────────────────────────
    console.log("\n[2] 19→20 boundary: 5 concurrent, exactly 1 succeeds");
    {
      const user = await seedUser({
        monthlyExports: EXPORT_LIMIT - 1,
        exportPeriodStart: new Date(),
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => convertReq(user.auth, "mp3")),
      );
      const ok = results.filter((r) => r.status === 200).length;
      const capped = results.filter((r) => r.status === 429).length;
      check("boundary: exactly 1 of 5 succeeds", ok === 1, `ok=${ok}`);
      check("boundary: other 4 get 429", capped === 4, `429=${capped}`);
      const row = await readUserRow(user.userId);
      check(
        `boundary: counter lands exactly on ${EXPORT_LIMIT}`,
        row?.monthlyExports === EXPORT_LIMIT,
        `monthly_exports=${row?.monthlyExports}`,
      );
    }

    // ── [3] Expired window: exactly one reset under concurrency ───────────────
    console.log("\n[3] Expired window: 6 concurrent all succeed, single reset");
    {
      const user = await seedUser({
        monthlyExports: EXPORT_LIMIT, // was maxed out in the OLD window
        exportPeriodStart: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      const results = await Promise.all(
        Array.from({ length: 6 }, () => convertReq(user.auth, "wav")),
      );
      const ok = results.filter((r) => r.status === 200).length;
      check("expired window: all 6 succeed", ok === 6, `ok=${ok}`);
      const row = await readUserRow(user.userId);
      check(
        "expired window: monthly_exports == 6 (one reset, five increments)",
        row?.monthlyExports === 6,
        `monthly_exports=${row?.monthlyExports}`,
      );
      const fresh = row?.exportPeriodStart &&
        Date.now() - row.exportPeriodStart.getTime() < 10 * 60 * 1000;
      check("expired window: export_period_start refreshed to now", !!fresh, String(row?.exportPeriodStart));
    }

    // ── [4] isDeveloper bypass ─────────────────────────────────────────────────
    console.log("\n[4] isDeveloper bypass at cap");
    {
      const user = await seedUser({
        monthlyExports: EXPORT_LIMIT,
        exportPeriodStart: new Date(),
        isDeveloper: true,
      });
      const res = await convertReq(user.auth, "mp3");
      check("developer at cap: HTTP 200", res.status === 200, `got ${res.status}`);
      const row = await readUserRow(user.userId);
      check(
        "developer at cap: counter untouched",
        row?.monthlyExports === EXPORT_LIMIT,
        `monthly_exports=${row?.monthlyExports}`,
      );
    }

    // ── [5] flac/m4a conversions are NOT counted ───────────────────────────────
    console.log("\n[5] flac/m4a at cap: allowed, not counted");
    {
      const user = await seedUser({
        monthlyExports: EXPORT_LIMIT,
        exportPeriodStart: new Date(),
      });
      const flac = await convertReq(user.auth, "flac");
      check("flac at cap: HTTP 200 (not quota-gated)", flac.status === 200, `got ${flac.status}`);
      const m4a = await convertReq(user.auth, "m4a");
      check("m4a at cap: HTTP 200 (not quota-gated)", m4a.status === 200, `got ${m4a.status}`);
      const row = await readUserRow(user.userId);
      check(
        "flac/m4a: counter untouched",
        row?.monthlyExports === EXPORT_LIMIT,
        `monthly_exports=${row?.monthlyExports}`,
      );
      // Control: mp3 for the same user IS blocked at cap.
      const mp3 = await convertReq(user.auth, "mp3");
      check("control: mp3 at cap → 429", mp3.status === 429, `got ${mp3.status}`);
    }
  } finally {
    // Cleanup: children (process_runs) → sessions → users
    for (const u of seeded) {
      await db.delete(processRunsTable).where(eq(processRunsTable.userId, u.userId)).catch(() => {});
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, u.sid)).catch(() => {});
      await db.delete(usersTable).where(eq(usersTable.id, u.userId)).catch(() => {});
    }
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Export quota concurrency check: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Test harness crashed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { pool } = await import("@workspace/db");
      await pool.end();
    } catch { /* ignore */ }
  });
