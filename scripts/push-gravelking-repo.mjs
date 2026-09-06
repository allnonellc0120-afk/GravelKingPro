/**
 * Sync the public GravelKingPro repository from the current web artifact.
 *
 * The GitHub Contents API is used deliberately: the repository's blob route
 * is not reliable in this environment, while Contents PUT creates a commit
 * for each file and handles both text and binary assets.
 *
 * Usage:
 *   node scripts/push-gravelking-repo.mjs --dry-run
 *   node scripts/push-gravelking-repo.mjs
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OWNER = "allnonellc0120-afk";
const REPO = "GravelKingPro";
const SRC_DIR = "artifacts/gravelkingpro";
const DRY = process.argv.includes("--dry-run");

const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  ".cache",
  ".local",
  ".replit-artifact",
  ".vite",
  "__pycache__",
]);
const IGNORED_SUFFIXES = [
  ".tsbuildinfo",
  ".log",
  ".pyc",
  ".pyo",
  ".egg-info",
];
const IGNORED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  "google-play-service-account.json",
]);

function ignored(name) {
  return (
    IGNORED_NAMES.has(name) ||
    IGNORED_FILES.has(name) ||
    IGNORED_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

function collect(dir, result = []) {
  for (const name of readdirSync(dir)) {
    if (ignored(name)) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) collect(path, result);
    else if (info.isFile()) result.push(relative(SRC_DIR, path).split("\\").join("/"));
  }
  return result.sort();
}

const connectors = new ReplitConnectors();
async function gh(path, options = {}) {
  const response = await connectors.proxy("github", path, options);
  const text = typeof response.text === "function" ? await response.text() : String(response);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status ?? response.statusCode ?? 0, json, text };
}

const files = collect(SRC_DIR);
const local = new Set(files);
const bytes = files.reduce((total, file) => total + statSync(join(SRC_DIR, file)).size, 0);
console.log(`Sync manifest: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
if (DRY) {
  for (const file of files) console.log(`  ${file}`);
  process.exit(0);
}

const root = await gh(`/repos/${OWNER}/${REPO}/git/trees/main?recursive=1`);
if (root.status !== 200 || !Array.isArray(root.json?.tree)) {
  console.error(`Unable to read remote tree: HTTP ${root.status}: ${root.text.slice(0, 300)}`);
  process.exit(1);
}

let created = 0;
let updated = 0;
let deleted = 0;
let failed = 0;
for (const entry of root.json.tree) {
  if (entry.type !== "blob" || local.has(entry.path)) continue;
  const remove = await gh(`/repos/${OWNER}/${REPO}/contents/${entry.path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `GravelKingPro sync: remove ${entry.path}`,
      sha: entry.sha,
      branch: "main",
    }),
  });
  if (remove.status === 200 || remove.status === 204) {
    deleted++;
    console.log(`  deleted ${entry.path}`);
  } else {
    failed++;
    console.error(`  delete failed ${entry.path}: HTTP ${remove.status} ${remove.text.slice(0, 180)}`);
  }
}

if (failed === 0) {
  for (const file of files) {
    const path = join(SRC_DIR, file);
    const existing = await gh(`/repos/${OWNER}/${REPO}/contents/${file}?ref=main`);
    const body = {
      message: `GravelKingPro sync: ${file}`,
      content: readFileSync(path).toString("base64"),
      branch: "main",
    };
    if (existing.status === 200 && existing.json?.sha) body.sha = existing.json.sha;
    const put = await gh(`/repos/${OWNER}/${REPO}/contents/${file}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (put.status === 200 || put.status === 201) {
      if (put.status === 201) created++;
      else updated++;
      console.log(`  ${put.status === 201 ? "created" : "updated"} ${file}`);
    } else {
      console.error(`  upload failed ${file}: HTTP ${put.status} ${put.text.slice(0, 180)}`);
      failed++;
      break;
    }
  }
}

console.log(`Sync result: ${created} created, ${updated} updated, ${deleted} deleted, ${failed} failed.`);
process.exit(failed ? 1 : 0);