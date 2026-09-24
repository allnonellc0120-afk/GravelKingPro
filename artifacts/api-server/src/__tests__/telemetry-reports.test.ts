import assert from "node:assert/strict";
import {
  buildTelemetryReport,
} from "../lib/telemetryReports";
import type { TokenTelemetryRecord } from "../middleware/tokenTracker";

const now = new Date("2026-09-13T20:00:00.000Z");

function record(overrides: Partial<TokenTelemetryRecord>): TokenTelemetryRecord {
  return {
    id: "record",
    operation: "jax_generate",
    client_id: "client-a",
    prompt_tokens: 10,
    completion_tokens: 2,
    raw_prompt_tokens: 20,
    processed_prompt_tokens: 10,
    raw_tokens_baseline: 20,
    actual_tokens_used: 12,
    tokens_suppressed: 10,
    suppression_percentage: 50,
    token_rate_per_million_usd: 3,
    dollar_savings: 0.00003,
    gka_gain_share_due: 0.00001,
    latency_overhead_ms: 0.2,
    status: "completed",
    created_at: "2026-09-13T19:00:00.000Z",
    ...overrides,
  };
}

const report = buildTelemetryReport("client-a", "daily", [
  record({ id: "current-a" }),
  record({ id: "failed-a", status: "failed", tokens_suppressed: 999 }),
  record({ id: "old-a", created_at: "2026-09-10T19:00:00.000Z", tokens_suppressed: 999 }),
  record({ id: "other-client", client_id: "client-b", tokens_suppressed: 999 }),
], now);

assert.equal(report.records.length, 1);
assert.equal(report.records[0]?.id, "current-a");
assert.equal(report.totalTokensSuppressed, 10);
assert.equal(report.totalDollarsSaved, 0.00003);
assert.equal(report.totalGkaGainShareDue, 0.00001);
assert.match(report.html, /Total Dollars Saved/);
assert.match(report.html, /Tokens Suppressed/);
assert.match(report.jsonl, /current-a/);
assert.doesNotMatch(report.jsonl, /client-b|failed-a|old-a/);
console.log("Telemetry report aggregation and client-isolation checks passed");