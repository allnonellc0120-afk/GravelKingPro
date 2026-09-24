import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createVertexProxyServer } from "./vertex-allowlist-proxy.mjs";

function startServer(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ host: address.address, port: address.port });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function request({ host, port, method = "POST", path: requestPath, headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, method, path: requestPath, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function startStandaloneProxy({ port, preloadPath, upstreamCallsPath }) {
  const proxyPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "vertex-allowlist-proxy.mjs");
  const child = spawn(process.execPath, ["--import", preloadPath, proxyPath], {
    env: {
      ...process.env,
      PORT: String(port),
      VERTEX_PROXY_TEST_UPSTREAM_CALLS: upstreamCallsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`standalone proxy did not start: ${stderr || output.join("")}`));
    }, 5000);
    const onExit = (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`standalone proxy exited before start (${code ?? signal}): ${stderr || output.join("")}`));
    };
    child.once("exit", onExit);
    child.stdout.on("data", (chunk) => {
      if (chunk.includes(`Vertex allowlist proxy listening on http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        child.off("exit", onExit);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      reject(error);
    });
  });

  return child;
}

function stopChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}

async function readLedger(ledgerFilePath) {
  const content = await readFile(ledgerFilePath, "utf8");
  return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "vertex-proxy-test-"));
const ledgerFilePath = path.join(tempDir, "ledger.jsonl");
const standaloneUpstreamCallsPath = path.join(tempDir, "standalone-upstream-calls.jsonl");
const standalonePreloadPath = path.join(tempDir, "standalone-fetch-preload.mjs");
await writeFile(
  standalonePreloadPath,
  `import { appendFile } from "node:fs/promises";
globalThis.fetch = async (url, init = {}) => {
  await appendFile(
    process.env.VERTEX_PROXY_TEST_UPSTREAM_CALLS,
    JSON.stringify({ url: String(url), method: init.method ?? "GET" }) + "\\n",
  );
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "standalone response" }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};
`,
);
let upstreamCalls = [];
let nextTraceId = 0;
let upstreamResponse = () => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text: "decoded response" }] } }] }),
  { status: 200, headers: { "content-type": "application/json", "content-encoding": "gzip" } },
);

const server = createVertexProxyServer({
  ledgerFilePath,
  traceIdFactory: () => `test-trace-${++nextTraceId}`,
  fetchImpl: async (url, init) => {
    upstreamCalls.push({ url: new URL(url), init });
    const response = upstreamResponse();
    if (response instanceof Error) throw response;
    return response;
  },
});
const address = await startServer(server);
const localHeaders = { host: `${address.host}:${address.port}` };
const regionalPath = "/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent";
const globalInteractionPath = "/v1beta1/projects/test-project/locations/global/interactions";
const globalPollPath = `${globalInteractionPath}/interaction-123`;

try {
  const regional = await request({
    ...address,
    path: regionalPath,
    headers: {
      ...localHeaders,
      authorization: "Bearer unchanged-token",
      "content-type": "application/json",
      "x-gka-operation": "jax_remix",
      "x-gka-client-id": "proxy-test",
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: "prompt" }] }] }),
  });
  assert.equal(regional.status, 200);
  assert.equal(regional.headers["content-encoding"], undefined);
  assert.equal(regional.headers["x-gka-proxy-trace-id"], "gka-proxy-test-trace-1");
  assert.deepEqual(JSON.parse(regional.body), {
    candidates: [{ content: { parts: [{ text: "decoded response" }] } }],
  });
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url.hostname, "us-central1-aiplatform.googleapis.com");
  assert.equal(upstreamCalls[0].url.pathname, regionalPath);
  assert.equal(upstreamCalls[0].init.headers.authorization, "Bearer unchanged-token");
  assert.equal(
    Buffer.from(upstreamCalls[0].init.body).toString(),
    JSON.stringify({ contents: [{ parts: [{ text: "prompt" }] }] }),
  );

  const globalPost = await request({ ...address, path: globalInteractionPath, headers: localHeaders, body: "{}" });
  assert.equal(globalPost.status, 200);
  assert.equal(upstreamCalls[1].url.hostname, "aiplatform.googleapis.com");
  assert.equal(upstreamCalls[1].init.method, "POST");

  const globalGet = await request({ ...address, method: "GET", path: globalPollPath, headers: localHeaders });
  assert.equal(globalGet.status, 200);
  assert.equal(upstreamCalls[2].url.hostname, "aiplatform.googleapis.com");
  assert.equal(upstreamCalls[2].init.method, "GET");
  assert.equal(upstreamCalls[2].init.body, undefined);

  const callsBeforeRejections = upstreamCalls.length;
  const rejectedRequests = [
    { path: regionalPath, headers: { host: "evil.example" } },
    { path: `http://evil.example${regionalPath}`, headers: localHeaders },
    { path: `${regionalPath}?unexpected=yes`, headers: localHeaders },
    { method: "GET", path: regionalPath, headers: localHeaders },
    { path: "/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:predict", headers: localHeaders },
  ];
  for (const rejectedRequest of rejectedRequests) {
    const response = await request({ ...address, ...rejectedRequest });
    assert.equal(response.status, 403, rejectedRequest.path);
  }
  assert.equal(upstreamCalls.length, callsBeforeRejections);

  upstreamResponse = () => new Response(JSON.stringify({ error: { message: "upstream rejected" } }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
  const failedResponse = await request({
    ...address,
    path: regionalPath,
    headers: localHeaders,
    body: "{}",
  });
  assert.equal(failedResponse.status, 429);
  assert.equal(failedResponse.headers["x-gka-proxy-trace-id"], "gka-proxy-test-trace-4");

  upstreamResponse = () => new Error("simulated upstream outage");
  const outageResponse = await request({
    ...address,
    path: regionalPath,
    headers: localHeaders,
    body: "{}",
  });
  assert.equal(outageResponse.status, 502);
  assert.equal(outageResponse.headers["x-gka-proxy-trace-id"], "gka-proxy-test-trace-5");
  assert.equal(JSON.parse(outageResponse.body).traceId, "gka-proxy-test-trace-5");

  const ledger = await readLedger(ledgerFilePath);
  assert.deepEqual(
    ledger.map((entry) => [entry.proxy_trace_id, entry.status]),
    [
      ["gka-proxy-test-trace-1", "completed"],
      ["gka-proxy-test-trace-2", "completed"],
      ["gka-proxy-test-trace-3", "completed"],
      ["gka-proxy-test-trace-4", "failed"],
      ["gka-proxy-test-trace-5", "failed"],
    ],
  );

  const unavailableLedgerPath = path.join(tempDir, "unavailable-ledger");
  await mkdir(unavailableLedgerPath);
  upstreamResponse = () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "must not relay" }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  const unavailableServer = createVertexProxyServer({
    ledgerFilePath: unavailableLedgerPath,
    traceIdFactory: () => "ledger-failure",
    fetchImpl: async (url, init) => {
      upstreamCalls.push({ url: new URL(url), init });
      return upstreamResponse();
    },
  });
  const unavailableAddress = await startServer(unavailableServer);
  const loggedErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => loggedErrors.push(args);
  let ledgerFailureResponse;
  try {
    ledgerFailureResponse = await request({
      ...unavailableAddress,
      path: regionalPath,
      headers: { host: `${unavailableAddress.host}:${unavailableAddress.port}` },
      body: "{}",
    });
  } finally {
    console.error = originalConsoleError;
    await stopServer(unavailableServer);
  }
  assert.equal(ledgerFailureResponse.status, 503);
  assert.equal(ledgerFailureResponse.headers["x-gka-proxy-trace-id"], "gka-proxy-ledger-failure");
  assert.equal(ledgerFailureResponse.headers["x-gka-proxy-ledger-status"], "unavailable");
  assert.deepEqual(JSON.parse(ledgerFailureResponse.body), {
    error: "Vertex audit ledger unavailable",
    traceId: "gka-proxy-ledger-failure",
  });
  assert.equal(
    loggedErrors.some(([message, details]) =>
      message === "Vertex proxy ledger write failed" &&
      details?.event === "vertex_proxy_ledger_write_failed" &&
      details.traceId === "gka-proxy-ledger-failure",
    ),
    true,
  );

  const standalonePort = await freePort();
  const standaloneChild = await startStandaloneProxy({
    port: standalonePort,
    preloadPath: standalonePreloadPath,
    upstreamCallsPath: standaloneUpstreamCallsPath,
  });
  try {
    const standaloneHealth = await request({
      host: "127.0.0.1",
      port: standalonePort,
      method: "GET",
      path: "/healthz",
      headers: { host: `127.0.0.1:${standalonePort}` },
    });
    assert.equal(standaloneHealth.status, 200);
    assert.deepEqual(JSON.parse(standaloneHealth.body), {
      ok: true,
      service: "vertex-allowlist-proxy",
      bind: `127.0.0.1:${standalonePort}`,
    });

    const standaloneApproved = await request({
      host: "127.0.0.1",
      port: standalonePort,
      path: regionalPath,
      headers: {
        host: `127.0.0.1:${standalonePort}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(standaloneApproved.status, 200);
    assert.deepEqual(JSON.parse(standaloneApproved.body), {
      candidates: [{ content: { parts: [{ text: "standalone response" }] } }],
    });
    assert.equal((await readFile(standaloneUpstreamCallsPath, "utf8")).trim().split("\n").length, 1);

    const standaloneHostRejected = await request({
      host: "127.0.0.1",
      port: standalonePort,
      path: regionalPath,
      headers: { host: "evil.example" },
      body: "{}",
    });
    assert.equal(standaloneHostRejected.status, 403);

    const standaloneAbsoluteTargetRejected = await request({
      host: "127.0.0.1",
      port: standalonePort,
      path: `http://evil.example${regionalPath}`,
      headers: { host: `127.0.0.1:${standalonePort}` },
      body: "{}",
    });
    assert.equal(standaloneAbsoluteTargetRejected.status, 403);
    assert.equal((await readFile(standaloneUpstreamCallsPath, "utf8")).trim().split("\n").length, 1);
  } finally {
    await stopChild(standaloneChild);
  }

  const recoveryLedgerPath = path.join(tempDir, "recovered-ledger.jsonl");
  const recoveryServer = createVertexProxyServer({
    ledgerFilePath: recoveryLedgerPath,
    traceIdFactory: () => "ledger-recovery",
    fetchImpl: async () => upstreamResponse(),
  });
  const recoveryAddress = await startServer(recoveryServer);
  try {
    const recoveredResponse = await request({
      ...recoveryAddress,
      path: regionalPath,
      headers: { host: `${recoveryAddress.host}:${recoveryAddress.port}` },
      body: "{}",
    });
    assert.equal(recoveredResponse.status, 200);
    assert.deepEqual((await readLedger(recoveryLedgerPath)).map((entry) => entry.proxy_trace_id), [
      "gka-proxy-ledger-recovery",
    ]);
  } finally {
    await stopServer(recoveryServer);
  }
} finally {
  await stopServer(server);
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Vertex allowlist proxy tests passed");