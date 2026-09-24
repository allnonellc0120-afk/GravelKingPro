/**
 * Loopback-only Vertex AI allowlist proxy.
 *
 * This is intentionally not a general HTTP proxy:
 * - it binds only to 127.0.0.1:8090;
 * - it maps approved Vertex paths to fixed Google Vertex hostnames;
 * - it forwards the request body, model parameters, and Authorization value;
 * - it never falls back to a direct request on an upstream error;
 * - it records one trace record for every completed upstream response.
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getEncoding } from "js-tiktoken";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT ?? "8090", 10);
const REGIONAL_VERTEX_HOST = "us-central1-aiplatform.googleapis.com";
const GLOBAL_VERTEX_HOST = "aiplatform.googleapis.com";
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  // Node fetch transparently decodes compressed upstream bodies. Do not
  // forward the stale encoding marker alongside the decoded bytes.
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const ledgerPath = path.resolve(scriptDirectory, "../data/token_savings_ledger.jsonl");
const tokenEncoding = getEncoding("cl100k_base");
let ledgerWriteQueue = Promise.resolve();

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function isLoopbackHostHeader(hostHeader) {
  if (hostHeader.startsWith("[")) {
    const closingBracket = hostHeader.indexOf("]");
    return closingBracket !== -1 && isLoopbackHostname(hostHeader.slice(1, closingBracket));
  }
  return isLoopbackHostname(hostHeader.split(":")[0]);
}

function isLoopbackRequest(req, requestUrl) {
  const target = req.url ?? "/";
  const isAbsoluteTarget = target.startsWith("http://") || target.startsWith("https://") || target.startsWith("//");
  if (isAbsoluteTarget && !isLoopbackHostname(requestUrl.hostname)) return false;

  const hostHeader = req.headers.host;
  return !hostHeader || isLoopbackHostHeader(hostHeader);
}

function requestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body exceeds proxy limit"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function matchVertexPath(url) {
  const regionalMatch = url.pathname.match(
    /^\/v1\/projects\/[A-Za-z0-9._-]+\/locations\/us-central1\/publishers\/google\/models\/[A-Za-z0-9._-]+:(generateContent|streamGenerateContent)$/,
  );
  if (regionalMatch) {
    const isStream = regionalMatch[1] === "streamGenerateContent";
    const queryKeys = [...url.searchParams.keys()];
    if (isStream && (queryKeys.length !== 1 || url.searchParams.get("alt") !== "sse")) return null;
    if (!isStream && queryKeys.length !== 0) return null;
    return { host: REGIONAL_VERTEX_HOST, method: "POST", kind: isStream ? "stream" : "completion" };
  }

  const interactionMatch = url.pathname.match(
    /^\/v1beta1\/projects\/[A-Za-z0-9._-]+\/locations\/global\/interactions(?:\/[A-Za-z0-9._-]+)?$/,
  );
  if (interactionMatch) {
    const isPoll = url.pathname.split("/").length === 8;
    if (url.search) return null;
    return { host: GLOBAL_VERTEX_HOST, method: isPoll ? "GET" : "POST", kind: isPoll ? "poll" : "completion" };
  }
  return null;
}

function forwardedRequestHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lowerName = name.toLowerCase();
    if (lowerName === "host" || HOP_BY_HOP_HEADERS.has(lowerName) || lowerName.startsWith("proxy-")) continue;
    headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

function collectText(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (typeof value.text === "string") output.push(value.text);
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (key !== "inlineData" && key !== "data") collectText(item, output);
    }
  }
  return output;
}

function requestText(body) {
  const parsed = parseJson(body);
  return parsed ? collectText(parsed).join("\n") : "";
}

function responseText(body, contentType) {
  if (contentType?.includes("text/event-stream")) {
    return body
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]")
      .map((line) => parseJson(Buffer.from(line.slice(5).trim())))
      .filter(Boolean)
      .flatMap((value) => collectText(value))
      .join("\n");
  }
  const parsed = parseJson(body);
  return parsed ? collectText(parsed).join("\n") : "";
}

function countTokens(text) {
  try {
    return tokenEncoding.encode(text).length;
  } catch {
    return 0;
  }
}

function appendTrace(record, targetLedgerPath = ledgerPath) {
  const write = ledgerWriteQueue.then(async () => {
    await mkdir(path.dirname(targetLedgerPath), { recursive: true });
    await appendFile(targetLedgerPath, `${JSON.stringify(record)}\n`, "utf8");
  });

  // Keep the queue usable after an individual failure, but let the caller
  // observe that this record was not durably written.
  ledgerWriteQueue = write.catch((error) => {
    console.error("Vertex proxy ledger write failed", {
      event: "vertex_proxy_ledger_write_failed",
      error: String(error),
      ledgerPath: targetLedgerPath,
      traceId: record.proxy_trace_id ?? record.id,
    });
  });
  return write;
}

function traceRecord({ traceId, req, url, response, responseBody, startedAt, requestBodyBuffer }) {
  const promptTokens = countTokens(requestText(requestBodyBuffer));
  const completionTokens = countTokens(responseText(responseBody, response.headers.get("content-type") ?? ""));
  const status = response.ok ? "completed" : "failed";
  return {
    id: traceId,
    operation: req.headers["x-gka-operation"] === "jax_remix" ? "jax_remix" : "simulation",
    client_id: typeof req.headers["x-gka-client-id"] === "string" ? req.headers["x-gka-client-id"] : null,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    raw_prompt_tokens: promptTokens,
    processed_prompt_tokens: promptTokens,
    raw_tokens_baseline: promptTokens,
    actual_tokens_used: promptTokens + completionTokens,
    tokens_suppressed: 0,
    suppression_percentage: 0,
    token_rate_per_million_usd: 0,
    dollar_savings: 0,
    gka_gain_share_due: 0,
    latency_overhead_ms: Number((performance.now() - startedAt).toFixed(4)),
    provider: "vertex-allowlist-proxy",
    status,
    created_at: new Date().toISOString(),
    proxy_trace_id: traceId,
    intercepted_host: url.hostname,
    intercepted_path: `${url.pathname}${url.search}`,
    upstream_status: response.status,
  };
}

function failedTraceRecord({ traceId, req, url, startedAt, requestBodyBuffer, status = 502 }) {
  const promptTokens = countTokens(requestText(requestBodyBuffer));
  return {
    id: traceId,
    operation: req.headers["x-gka-operation"] === "jax_remix" ? "jax_remix" : "simulation",
    client_id: typeof req.headers["x-gka-client-id"] === "string" ? req.headers["x-gka-client-id"] : null,
    prompt_tokens: promptTokens,
    completion_tokens: 0,
    raw_prompt_tokens: promptTokens,
    processed_prompt_tokens: promptTokens,
    raw_tokens_baseline: promptTokens,
    actual_tokens_used: promptTokens,
    tokens_suppressed: 0,
    suppression_percentage: 0,
    token_rate_per_million_usd: 0,
    dollar_savings: 0,
    gka_gain_share_due: 0,
    latency_overhead_ms: Number((performance.now() - startedAt).toFixed(4)),
    provider: "vertex-allowlist-proxy",
    status: "failed",
    created_at: new Date().toISOString(),
    proxy_trace_id: traceId,
    intercepted_host: url.hostname,
    intercepted_path: `${url.pathname}${url.search}`,
    upstream_status: status,
  };
}

export function createVertexProxyServer({
  fetchImpl = fetch,
  traceIdFactory = randomUUID,
  ledgerFilePath = ledgerPath,
} = {}) {
  // Fail closed: a Vertex response is never relayed unless its audit record
  // has been written successfully.
  function respondLedgerUnavailable(res, traceId) {
    json(
      res,
      503,
      { error: "Vertex audit ledger unavailable", traceId },
      {
        "x-gka-proxy-trace-id": traceId,
        "x-gka-proxy-ledger-status": "unavailable",
      },
    );
  }

  async function handle(req, res) {
    const requestUrl = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    if (!isLoopbackRequest(req, requestUrl)) {
      json(res, 403, { error: "Vertex endpoint is not allowlisted" });
      return;
    }
    if (requestUrl.pathname === "/healthz" && req.method === "GET") {
      json(res, 200, { ok: true, service: "vertex-allowlist-proxy", bind: `${HOST}:${PORT}` });
      return;
    }

    const route = matchVertexPath(requestUrl);
    if (!route || req.method !== route.method) {
      json(res, 403, { error: "Vertex endpoint is not allowlisted" });
      return;
    }

    const body = route.method === "GET" ? Buffer.alloc(0) : await requestBody(req);
    const upstreamUrl = new URL(requestUrl);
    upstreamUrl.protocol = "https:";
    upstreamUrl.hostname = route.host;
    upstreamUrl.port = "";
    const traceId = `gka-proxy-${traceIdFactory()}`;
    const startedAt = performance.now();
    let upstream;
    let responseBody = Buffer.alloc(0);
    try {
      upstream = await fetchImpl(upstreamUrl, {
        method: route.method,
        headers: forwardedRequestHeaders(req),
        body: route.method === "GET" ? undefined : body,
        signal: AbortSignal.timeout(300_000),
      });
      responseBody = Buffer.from(await upstream.arrayBuffer());
      const responseHeaders = {};
      for (const [name, value] of upstream.headers) {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
      }
      responseHeaders["x-gka-proxy-trace-id"] = traceId;
      try {
        await appendTrace(traceRecord({
          traceId,
          req,
          url: upstreamUrl,
          response: upstream,
          responseBody,
          startedAt,
          requestBodyBuffer: body,
        }), ledgerFilePath);
      } catch {
        respondLedgerUnavailable(res, traceId);
        return;
      }
      res.writeHead(upstream.status, responseHeaders);
      res.end(responseBody);
    } catch (error) {
      console.error("Vertex proxy upstream failure", {
        traceId,
        host: upstreamUrl.hostname,
        path: upstreamUrl.pathname,
        error: String(error),
      });
      try {
        await appendTrace(failedTraceRecord({
          traceId,
          req,
          url: upstreamUrl,
          startedAt,
          requestBodyBuffer: body,
        }), ledgerFilePath);
      } catch {
        respondLedgerUnavailable(res, traceId);
        return;
      }
      json(res, 502, { error: "Vertex upstream unavailable", traceId }, { "x-gka-proxy-trace-id": traceId });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      const status = Number(error?.statusCode) || 500;
      if (!res.headersSent) json(res, status, { error: status === 413 ? "Request body too large" : "Proxy request failed" });
      else res.destroy();
    });
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createVertexProxyServer();
  server.on("error", (error) => {
    console.error("Vertex allowlist proxy failed to start", { error: String(error) });
    process.exitCode = 1;
  });

  server.listen(PORT, HOST, () => {
    console.log(`Vertex allowlist proxy listening on http://${HOST}:${PORT}`);
  });
}