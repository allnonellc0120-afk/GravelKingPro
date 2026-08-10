/**
 * Integration test: the admin benchmark surfaces.
 *
 * Runs the real Express `app` in-process and asserts:
 *   - /api/admin/benchmark/kernel rejects unauthenticated callers (403)
 *   - authenticated run returns real timing fields (min/median/max, realtime
 *     multiplier, engine, fixture metadata) from the LOCAL Python kernel
 *   - bad parameters (runs out of bounds) → 400, never 500
 *   - /tmp gk_bench_* fixtures are cleaned up after both success and failure
 *   - /api/admin/benchmark/e2e performs a real loopback /api/v1/ingest request
 *     and decomposes upload / kernel / server / network timing
 *   - /api/healthz reports a numeric serverMs alongside status
 */
import http from "node:http";
import { readdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";

// Force the local Python worker + a known admin key BEFORE the app loads.
delete process.env.MLK_KERNEL_URL;
process.env.ADMIN_KEY = process.env.ADMIN_KEY || "bench-test-admin-key";

import app from "../app";

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

async function main(): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  // The e2e benchmark calls back into this same server via PORT.
  process.env.PORT = String(port);
  const adminHeaders = { "x-admin-key": process.env.ADMIN_KEY!, "Content-Type": "application/json" };

  // Snapshot pre-existing benchmark temp files: another process (dev server,
  // concurrent validation run) may be benchmarking at the same time, so the
  // cleanup assertion must only count files created AFTER this test started.
  const preExisting = new Set((await readdir("/tmp")).filter((f) => f.startsWith("gk_bench_")));

  try {
    // ── healthz serverMs ─────────────────────────────────────────────────────
    const hz = await fetch(`${base}/api/healthz`);
    const hzBody = (await hz.json()) as { status?: string; serverMs?: number };
    check("healthz returns 200 ok", hz.ok && hzBody.status === "ok");
    check("healthz reports numeric serverMs", typeof hzBody.serverMs === "number" && hzBody.serverMs >= 0, JSON.stringify(hzBody));
    check("healthz sets Server-Timing header", (hz.headers.get("server-timing") ?? "").includes("dur="));

    // ── auth gating ──────────────────────────────────────────────────────────
    const noAuth = await fetch(`${base}/api/admin/benchmark/kernel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    check("kernel benchmark without auth → 403", noAuth.status === 403, `got ${noAuth.status}`);

    // ── parameter bounds ─────────────────────────────────────────────────────
    const badRuns = await fetch(`${base}/api/admin/benchmark/kernel`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({ runs: 99 }),
    });
    check("runs=99 rejected with 400", badRuns.status === 400, `got ${badRuns.status}`);
    const badDur = await fetch(`${base}/api/admin/benchmark/kernel`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({ durationS: 0 }),
    });
    check("durationS=0 rejected with 400", badDur.status === 400, `got ${badDur.status}`);

    // ── real kernel benchmark ────────────────────────────────────────────────
    const kb = await fetch(`${base}/api/admin/benchmark/kernel`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({ runs: 2, durationS: 2 }),
    });
    const kbBody = (await kb.json()) as {
      success?: boolean; engine?: string; completedLocally?: boolean;
      fixture?: { durationS: number; bytes: number };
      runs?: Array<{ processingMs: number; completedAt: string }>;
      summary?: { runs: number; minMs: number; medianMs: number; maxMs: number; realtimeMultiplier: number | null };
    };
    check("kernel benchmark → 200 success", kb.status === 200 && kbBody.success === true, JSON.stringify(kbBody).slice(0, 200));
    check("engine is local (MLK_KERNEL_URL cleared)", kbBody.engine === "local" && kbBody.completedLocally === true);
    check("2 runs with positive processingMs", kbBody.runs?.length === 2 && kbBody.runs.every((r) => r.processingMs > 0 && !!r.completedAt));
    check(
      "summary min ≤ median ≤ max, all positive",
      !!kbBody.summary && kbBody.summary.minMs > 0 && kbBody.summary.minMs <= kbBody.summary.medianMs && kbBody.summary.medianMs <= kbBody.summary.maxMs,
      JSON.stringify(kbBody.summary),
    );
    check("realtime multiplier is a positive number", typeof kbBody.summary?.realtimeMultiplier === "number" && kbBody.summary.realtimeMultiplier > 0);
    check("fixture metadata reported", kbBody.fixture?.durationS === 2 && (kbBody.fixture?.bytes ?? 0) > 0);

    // ── e2e partner-path benchmark ───────────────────────────────────────────
    const e2e = await fetch(`${base}/api/admin/benchmark/e2e`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({ durationS: 2 }),
    });
    const e2eBody = (await e2e.json()) as {
      success?: boolean; outputBytes?: number;
      timings?: { totalMs: number; uploadAndParseMs: number | null; kernelMs: number | null; serverTotalMs: number | null; networkAndResponseMs: number | null };
    };
    check("e2e benchmark → 200 success", e2e.status === 200 && e2eBody.success === true, JSON.stringify(e2eBody).slice(0, 300));
    const t = e2eBody.timings;
    check("e2e total is positive", (t?.totalMs ?? 0) > 0);
    check("e2e upload/parse timing present", typeof t?.uploadAndParseMs === "number" && t.uploadAndParseMs >= 0);
    check("e2e kernel timing present and dominant-plausible", typeof t?.kernelMs === "number" && t.kernelMs > 0 && t.kernelMs <= (t.totalMs ?? 0));
    check("e2e server + network decomposition present", typeof t?.serverTotalMs === "number" && typeof t?.networkAndResponseMs === "number" && t.networkAndResponseMs >= 0);
    check("e2e returned mastered audio bytes", (e2eBody.outputBytes ?? 0) > 1000);

    // ── cleanup guarantee ────────────────────────────────────────────────────
    const leftovers = (await readdir("/tmp")).filter((f) => f.startsWith("gk_bench_") && !preExisting.has(f));
    check("no new gk_bench_* fixtures left in /tmp", leftovers.length === 0, leftovers.join(", "));
  } finally {
    server.close();
  }

  console.log(`\nbenchmark.test: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    process.exitCode = 1;
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
