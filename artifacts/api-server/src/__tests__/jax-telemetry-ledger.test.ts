import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const ledgerDirectory = await mkdtemp(path.join(os.tmpdir(), "gk-jax-ledger-"));
process.env.NODE_ENV = "test";
process.env.ADMIN_KEY = process.env.ADMIN_KEY || "jax-ledger-test-key";
process.env.JAX_TEST_RESPONSE = "test response";
process.env.GKA_TOKEN_LEDGER_PATH = path.join(ledgerDirectory, "ledger.jsonl");

const { default: app } = await import("../app.js");

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const adminHeaders = {
  "Content-Type": "application/json",
  "x-admin-key": process.env.ADMIN_KEY!,
  "x-admin-user": "Allnonellc0120@gmail.com",
};
const clientId = "enterprise-multi-turn-ledger-test";
const otherClientId = "enterprise-isolation-ledger-test";
const clientToken = "gka_live_client_test_token_00000001";
const otherClientToken = "gka_live_other_test_token_00000002";
process.env.GKA_LIVE_TELEMETRY_CLIENTS = JSON.stringify([
  { clientId, token: clientToken },
  { clientId: otherClientId, token: otherClientToken },
]);
const responseText = process.env.JAX_TEST_RESPONSE;
const turns = [
  "Create a TypeScript function that adds two numbers.",
  "Now make it generic and add a typed test.",
  "Add error handling and explain the return type.",
  "Refactor the final implementation for production use.",
];
const history: Array<{ role: "user" | "jax"; content: string }> = [];

try {
  const oversized = await fetch(`${base}/api/jax/generate`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ message: "x", padding: "x".repeat(2 * 1024 * 1024) }),
  });
  assert.equal(oversized.status, 413, "requests above the 2 MB JSON limit must be rejected");

  for (const prompt of turns) {
    const result = await fetch(`${base}/api/jax/generate`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ message: prompt, history, clientId, modelRatePerMillionUsd: 3 }),
    });
    assert.equal(result.status, 200);
    const body = await result.json() as { text: string; tokenTelemetry: { raw_prompt_tokens: number; processed_prompt_tokens: number; completion_tokens: number } };
    assert.equal(body.text, responseText);
    assert.equal(body.tokenTelemetry.completion_tokens, 2);
    history.push({ role: "user", content: prompt }, { role: "jax", content: responseText });
  }

  const otherClientResponse = await fetch(`${base}/api/jax/generate`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      message: "Record this telemetry for a separate enterprise client.",
      clientId: otherClientId,
      modelRatePerMillionUsd: 3,
    }),
  });
  assert.equal(otherClientResponse.status, 200);
  const otherClientBody = await otherClientResponse.json() as {
    text: string;
    tokenTelemetry: { completion_tokens: number };
  };
  assert.equal(otherClientBody.text, responseText);
  assert.equal(otherClientBody.tokenTelemetry.completion_tokens, 2);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const lines = (await readFile(process.env.GKA_TOKEN_LEDGER_PATH!, "utf8")).trim().split("\n");
  const records = lines.map((line) => JSON.parse(line) as {
    client_id: string;
    raw_prompt_tokens: number;
    processed_prompt_tokens: number;
    tokens_suppressed: number;
    dollar_savings: number;
    gka_gain_share_due: number;
  });
  assert.equal(records.length, 5);
  assert.equal(records.filter((record) => record.client_id === clientId).length, 4);
  assert.equal(records.filter((record) => record.client_id === otherClientId).length, 1);

  const ledgerResponse = await fetch(`${base}/api/jax/telemetry/ledger?clientId=${encodeURIComponent(clientId)}`, {
    headers: adminHeaders,
  });
  assert.equal(ledgerResponse.status, 200);
  const summary = await ledgerResponse.json() as {
    recordCount: number; totalRawTokens: number; totalCarvedTokens: number;
    totalTokensSuppressed: number; totalDollarsSaved: number; totalGkaGainShareDue: number;
  };
  assert.deepEqual(summary, {
    clientId, recordCount: 4, totalRawTokens: 1249, totalCarvedTokens: 1193,
    totalTokensSuppressed: 56, totalDollarsSaved: 0.000168, totalGkaGainShareDue: 0.000056,
  });
  assert.equal(Number((summary.totalGkaGainShareDue / summary.totalDollarsSaved).toFixed(2)), 0.33);

  const otherClientRecord = records.find((record) => record.client_id === otherClientId);
  assert.ok(otherClientRecord);
  const otherLedgerResponse = await fetch(
    `${base}/api/jax/telemetry/ledger?clientId=${encodeURIComponent(otherClientId)}`,
    { headers: adminHeaders },
  );
  assert.equal(otherLedgerResponse.status, 200);
  const otherSummary = await otherLedgerResponse.json() as typeof summary;
  assert.deepEqual(otherSummary, {
    clientId: otherClientId,
    recordCount: 1,
    totalRawTokens: otherClientRecord.raw_prompt_tokens,
    totalCarvedTokens: otherClientRecord.processed_prompt_tokens,
    totalTokensSuppressed: otherClientRecord.tokens_suppressed,
    totalDollarsSaved: otherClientRecord.dollar_savings,
    totalGkaGainShareDue: otherClientRecord.gka_gain_share_due,
  });

  for (const query of ["", "?token=", "?token=invalid-token"]) {
    const unauthorized = await fetch(`${base}/api/telemetry/live${query}`);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "Unauthorized" });
  }

  const duplicateToken = "gka_live_duplicate_test_token_00003";
  process.env.GKA_LIVE_TELEMETRY_CLIENTS = JSON.stringify([
    { clientId, token: duplicateToken },
    { clientId: otherClientId, token: duplicateToken },
  ]);
  const duplicateTokenResponse = await fetch(
    `${base}/api/telemetry/live?token=${encodeURIComponent(duplicateToken)}`,
  );
  assert.equal(duplicateTokenResponse.status, 401);
  process.env.GKA_LIVE_TELEMETRY_CLIENTS = JSON.stringify([
    { clientId, token: clientToken },
    { clientId: otherClientId, token: otherClientToken },
  ]);

  const liveResponse = await fetch(
    `${base}/api/telemetry/live?token=${encodeURIComponent(clientToken)}&limit=500`,
  );
  assert.equal(liveResponse.status, 200);
  assert.equal(liveResponse.headers.get("cache-control"), "no-store, private");
  const live = await liveResponse.json() as {
    clientId: string;
    summary: typeof summary;
    records: Array<{ client_id: string }>;
  };
  assert.equal(live.clientId, clientId);
  assert.deepEqual(live.summary, summary);
  assert.equal(live.records.length, 4);
  assert.ok(live.records.every((record) => record.client_id === clientId));
  assert.doesNotMatch(JSON.stringify(live), new RegExp(otherClientId));

  const otherLiveResponse = await fetch(`${base}/api/telemetry/live`, {
    headers: { Authorization: `Bearer ${otherClientToken}` },
  });
  assert.equal(otherLiveResponse.status, 200);
  const otherLive = await otherLiveResponse.json() as {
    clientId: string;
    records: Array<{ client_id: string }>;
  };
  assert.equal(otherLive.clientId, otherClientId);
  assert.equal(otherLive.records.length, 1);
  assert.ok(otherLive.records.every((record) => record.client_id === otherClientId));
  console.log("JAX multi-turn telemetry ledger regression checks passed");
} finally {
  server.close();
  await rm(ledgerDirectory, { recursive: true, force: true });
}