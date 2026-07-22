/**
 * Integration test: whitepaper distribution endpoints.
 *
 * Runs the real Express `app` in-process and asserts the public
 * enterprise-brief surface:
 *   - GET /api/v1/whitepaper-spec     → 200 JSON, correct document data model
 *   - GET /api/v1/download-whitepaper → 200 application/pdf, multi-page brief
 *   - GET /api/whitepaper.pdf (alias) → identical bytes to the canonical route
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import app from "../app";

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

async function main(): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  // ── GET /api/v1/whitepaper-spec ──────────────────────────────────────────────
  console.log("\nGET /api/v1/whitepaper-spec");
  const specRes = await fetch(`${base}/api/v1/whitepaper-spec`);
  check("HTTP 200", specRes.status === 200, `got ${specRes.status}`);
  check(
    "content-type application/json",
    (specRes.headers.get("content-type") ?? "").includes("application/json"),
    specRes.headers.get("content-type") ?? "none",
  );
  const spec = (await specRes.json()) as {
    meta?: { title?: string };
    technology?: { kernel?: string };
    ingestionPipeline?: { tiers?: unknown[] };
    api?: { endpoints?: Array<{ path?: string }>; supportedFormats?: { lossless?: unknown[] } };
    legalCompliance?: unknown[];
  };
  check("meta.title references MLK V3.5", Boolean(spec.meta?.title?.includes("MLK V3.5")), spec.meta?.title ?? "missing");
  check("technology.kernel = MLK_v3.5", spec.technology?.kernel === "MLK_v3.5", String(spec.technology?.kernel));
  check("3 ingestion tiers", spec.ingestionPipeline?.tiers?.length === 3, `got ${spec.ingestionPipeline?.tiers?.length}`);
  check("at least 7 documented endpoints", (spec.api?.endpoints?.length ?? 0) >= 7, `got ${spec.api?.endpoints?.length}`);
  check(
    "documents /api/v1/download-whitepaper",
    Boolean(spec.api?.endpoints?.some((e) => e.path === "/api/v1/download-whitepaper")),
  );
  check("4 legal compliance standards", spec.legalCompliance?.length === 4, `got ${spec.legalCompliance?.length}`);
  check("lossless formats listed", (spec.api?.supportedFormats?.lossless?.length ?? 0) >= 3);

  // ── GET /api/v1/download-whitepaper ──────────────────────────────────────────
  console.log("\nGET /api/v1/download-whitepaper");
  const pdfRes = await fetch(`${base}/api/v1/download-whitepaper`);
  check("HTTP 200", pdfRes.status === 200, `got ${pdfRes.status}`);
  check(
    "content-type application/pdf",
    (pdfRes.headers.get("content-type") ?? "").includes("application/pdf"),
    pdfRes.headers.get("content-type") ?? "none",
  );
  check(
    "attachment content-disposition with filename",
    (pdfRes.headers.get("content-disposition") ?? "").includes('attachment; filename="GravelKingPro-MLKv35-Technical-Brief.pdf"'),
    pdfRes.headers.get("content-disposition") ?? "none",
  );
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  check("starts with %PDF magic bytes", pdfBuf.subarray(0, 5).toString("latin1") === "%PDF-");
  check("substantial document (> 20 KB)", pdfBuf.length > 20_000, `${pdfBuf.length} bytes`);
  const pageCount = (pdfBuf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("multi-page brief (>= 7 pages)", pageCount >= 7, `${pageCount} pages`);

  // ── GET /api/whitepaper.pdf (legacy alias) ───────────────────────────────────
  console.log("\nGET /api/whitepaper.pdf (alias)");
  const aliasRes = await fetch(`${base}/api/whitepaper.pdf`);
  check("HTTP 200", aliasRes.status === 200, `got ${aliasRes.status}`);
  const aliasBuf = Buffer.from(await aliasRes.arrayBuffer());
  check("alias serves identical bytes", aliasBuf.equals(pdfBuf), `${aliasBuf.length} vs ${pdfBuf.length} bytes`);

  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`\nwhitepaper endpoints: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`FAIL: ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
