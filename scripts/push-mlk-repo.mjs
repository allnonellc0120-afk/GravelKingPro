/**
 * Push MorrisLawKernel/ files to the private GitHub repo
 * allnonellc0120-afk/MorrisLawKernel via the Replit GitHub connector.
 *
 * Usage: node scripts/push-mlk-repo.mjs [--dry-run]
 *
 * Uses the Contents API (PUT /repos/{owner}/{repo}/contents/{path}) so it
 * creates-or-updates each file on the default branch with the existing sha
 * when present.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const OWNER = "allnonellc0120-afk";
const REPO = "MorrisLawKernel";
const SRC_DIR = "MorrisLawKernel";
const DRY = process.argv.includes("--dry-run");

const connectors = new ReplitConnectors();

async function gh(path, options = {}) {
  const res = await connectors.proxy("github", path, options);
  const text = typeof res.text === "function" ? await res.text() : String(res);
  let status = res.status ?? res.statusCode ?? 0;
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status, json, text };
}

const files = readdirSync(SRC_DIR).filter((f) => statSync(join(SRC_DIR, f)).isFile());
console.log(`Pushing ${files.length} files from ${SRC_DIR}/ → ${OWNER}/${REPO}`);

let ok = 0, failed = 0;
for (const f of files) {
  const localPath = join(SRC_DIR, f);
  const content = readFileSync(localPath).toString("base64");
  const repoPath = f; // repo root layout mirrors the folder

  if (DRY) { console.log(`  [dry] ${f} (${Math.round(content.length * 0.75 / 1024)} KB)`); continue; }

  // GET existing sha (required for updates)
  const get = await gh(`/repos/${OWNER}/${REPO}/contents/${repoPath}`);
  const body = {
    message: `Morris Law Kernel V3.5 — sync from GravelKing Pro (${f})`,
    content,
  };
  if (get.status === 200 && get.json?.sha) body.sha = get.json.sha;

  const put = await gh(`/repos/${OWNER}/${REPO}/contents/${repoPath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (put.status === 200 || put.status === 201) {
    ok++;
    console.log(`  ✓ ${f} (${put.status === 201 ? "created" : "updated"})`);
  } else {
    failed++;
    console.log(`  ✗ ${f} — HTTP ${put.status}: ${(put.text || "").slice(0, 160)}`);
  }
}

console.log(failed === 0 ? `\nAll ${ok} files pushed.` : `\n${ok} pushed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
