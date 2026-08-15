// Unit tests for the export-quota badge logic (task: surface the 20-per-30-days
// export cap BEFORE users hit it). Run with: pnpm --filter @workspace/gravelkingpro test
import test from "node:test";
import assert from "node:assert/strict";
import { exportQuotaLabel, formatResetDate } from "../src/lib/export-quota-label.ts";

const RESET = "2026-09-13T00:00:00.000Z";

test("fresh window — full quota, no reset date yet", () => {
  const { text, tone } = exportQuotaLabel({ used: 0, limit: 20, remaining: 20, resetsAt: null });
  assert.equal(text, "20 of 20 exports left");
  assert.equal(tone, "normal");
});

test("mid window — reset date shown even when plenty remain", () => {
  const { text, tone } = exportQuotaLabel({ used: 10, limit: 20, remaining: 10, resetsAt: RESET });
  assert.equal(text, `10 of 20 exports left · resets ${formatResetDate(RESET)}`);
  assert.equal(tone, "normal");
});

test("low remaining (3) — emphasized, reset date shown", () => {
  const { text, tone } = exportQuotaLabel({ used: 17, limit: 20, remaining: 3, resetsAt: RESET });
  assert.equal(tone, "low");
  assert.ok(text.startsWith("3 of 20 exports left"));
  assert.ok(text.includes(`resets ${formatResetDate(RESET)}`));
});

test("exhausted (0) — explains the reset date instead of failing", () => {
  const { text, tone } = exportQuotaLabel({ used: 20, limit: 20, remaining: 0, resetsAt: RESET });
  assert.equal(tone, "exhausted");
  assert.equal(text, `Export limit reached — resets ${formatResetDate(RESET)}`);
});

test("completing a run with one credit remaining → post-run refresh reads 0", () => {
  // Before the run: 1 left (low emphasis warns the user)
  const before = exportQuotaLabel({ used: 19, limit: 20, remaining: 1, resetsAt: RESET });
  assert.equal(before.tone, "low");
  // After the run consumed the last credit: exhausted messaging. The UI keeps
  // the just-produced result downloadable (credit already spent server-side)
  // and gates only NEW processing runs — asserted here as the label contract.
  const after = exportQuotaLabel({ used: 20, limit: 20, remaining: 0, resetsAt: RESET });
  assert.equal(after.tone, "exhausted");
  assert.ok(after.text.includes("resets"));
});

test("formatResetDate tolerates null and garbage", () => {
  assert.equal(formatResetDate(null), "");
  assert.equal(typeof formatResetDate("not-a-date"), "string");
});
