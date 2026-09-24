import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createNewsProxy, getStorkTargetUrl, STORK_WIRE_URL } from "../routes/newsProxy";

async function main(): Promise<void> {
  const target = new URL(getStorkTargetUrl("/news/archive/2026?tag=indie&tag=wire&next=%2Fhome"));
  assert.equal(target.origin, "https://www.stork.ai");
  assert.equal(target.pathname, "/wire/wa3l9nvf14gbmqa40/archive/2026");
  assert.equal(target.search, "?tag=indie&tag=wire&next=%2Fhome");
  assert.equal(getStorkTargetUrl("/news"), STORK_WIRE_URL);
  assert.equal(getStorkTargetUrl("/newspaper"), STORK_WIRE_URL);

  let requestedUrl = "";
  let requestedRedirectMode = "";
  let upstreamStatus = 200;
  let failUpstream = false;
  const app = express();
  app.use(
    "/news",
    createNewsProxy(async (input, init) => {
      requestedUrl = String(input);
      requestedRedirectMode = String(init?.redirect);
      if (failUpstream) throw new Error("upstream connection refused");
      return new Response("<!doctype html><html><body>Wire feed</body></html>", {
        status: upstreamStatus,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/news/archive/2026?tag=indie&tag=wire&next=%2Fhome`,
    );
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.url, `http://127.0.0.1:${address.port}/news/archive/2026?tag=indie&tag=wire&next=%2Fhome`);
    assert.equal(requestedUrl, "https://www.stork.ai/wire/wa3l9nvf14gbmqa40/archive/2026?tag=indie&tag=wire&next=%2Fhome");
    assert.equal(requestedRedirectMode, "follow");
    assert.match(html, /stork-wire:/);
    assert.match(html, /Wire feed/);

    const headResponse = await fetch(`http://127.0.0.1:${address.port}/news`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("stork-wire"), "proxied");
    assert.equal(await headResponse.text(), "");

    upstreamStatus = 503;
    const upstreamFailure = await fetch(`http://127.0.0.1:${address.port}/news`);
    assert.equal(upstreamFailure.status, 503);
    assert.match(await upstreamFailure.text(), /Wire feed/);

    failUpstream = true;
    const proxyFailure = await fetch(`http://127.0.0.1:${address.port}/news`);
    assert.equal(proxyFailure.status, 502);
    assert.match(await proxyFailure.text(), /upstream connection refused/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  console.log("Stork Wire proxy preserves path/query, handles HEAD, and exposes upstream failures.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});