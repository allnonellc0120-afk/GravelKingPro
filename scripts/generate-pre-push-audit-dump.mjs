#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = "artifacts/pre_push_audit_dump.json";
const productionFiles = [
  "scripts/gka_customer_zero_proxy.py",
  "artifacts/api-server/src/app.ts",
  "artifacts/api-server/src/index.ts",
  "artifacts/api-server/src/routes/index.ts",
  "artifacts/api-server/src/routes/jax.ts",
  "artifacts/api-server/src/routes/telemetry.ts",
  "artifacts/api-server/src/middleware/tokenTracker.ts",
  "artifacts/api-server/src/lib/liveTelemetryConfig.ts",
  "artifacts/api-server/src/lib/telemetryReports.ts",
  "artifacts/api-server/build.mjs",
  "artifacts/api-server/package.json",
  "package.json",
];

const files = [];
for (const filePath of productionFiles) {
  const content = await readFile(path.resolve(workspace, filePath), "utf8");
  files.push({
    path: filePath,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    content,
  });
}

const dump = {
  schema: "gka.pre-push-audit.v1",
  generatedAt: new Date().toISOString(),
  warning: "Source code for external security audit. Environment variables, secrets, ledger data, credentials, and node_modules are intentionally excluded.",
  fileCount: files.length,
  files,
};
const absoluteOutput = path.resolve(workspace, outputPath);
await mkdir(path.dirname(absoluteOutput), { recursive: true });
await writeFile(absoluteOutput, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
console.log(outputPath);