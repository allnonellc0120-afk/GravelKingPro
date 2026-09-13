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

  await new Promise((resolve) => setTimeout(resolve, 25));
  const lines = (await readFile(process.env.GKA_TOKEN_LEDGER_PATH!, "utf8")).trim().split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => JSON.parse(line).client_id === clientId));

  const ledgerResponse = await fetch(`${base}/api/jax/telemetry/ledger?clientId=${clientId}`, {
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
  console.log("JAX multi-turn telemetry ledger regression checks passed");
} finally {
  server.close();
  await rm(ledgerDirectory, { recursive: true, force: true });
}