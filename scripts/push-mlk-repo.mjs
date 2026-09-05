/**
 * Push MorrisLawKernel/ files to the private GitHub repo
 * allnonellc0120-afk/MorrisLawKernel via the Replit GitHub connector.
 *
 * Usage: node scripts/push-mlk-repo.mjs [--dry-run]
 *
 * Uses the Contents API (PUT /repos/{owner}/{repo}/contents/{path}) so it
 * creates-or-updates each file on the default branch with the existing sha
 * when present. Before uploading, it removes stale root files so the private
 * repo mirrors the local staging directory.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const OWNER = "allnonellc0120-afk";
const REPO = "MorrisLawKernel";
const SRC_DIR = "MorrisLawKernel";
const DRY = process.argv.includes("--dry-run");

// These entries are local runtime/build artifacts, not source files to sync.
// Keep this aligned with the root-level patterns in MorrisLawKernel/.gitignore.
const IGNORED_ROOT_ENTRIES = new Set([
  "__pycache__",
  ".DS_Store",
  ".git",
  ".streamlit",
  "build",
  "dist",
  "lyric_vault.json",
  "node_modules",
  ".venv",
  "venv",
]);

function isIgnoredEntry(name) {
  return (
    IGNORED_ROOT_ENTRIES.has(name) ||
    name.endsWith(".egg-info") ||
    name.endsWith(".ots") ||
    name.endsWith(".pyd") ||
    name.endsWith(".pyc") ||
    name.endsWith(".pyo") ||
    name.endsWith(".wav")
  );
}

const connectors = new ReplitConnectors();

async function gh(path, options = {}) {
  const res = await connectors.proxy("github", path, options);
  const text = typeof res.text === "function" ? await res.text() : String(res);
  let status = res.status ?? res.statusCode ?? 0;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status, json, text };
}

const files = readdirSync(SRC_DIR).filter(
  (f) => statSync(join(SRC_DIR, f)).isFile() && !isIgnoredEntry(f),
);
const localFileNames = new Set(files);
console.log(
  `Pushing ${files.length} files from ${SRC_DIR}/ → ${OWNER}/${REPO}`,
);

let ok = 0;
let deleted = 0;
let failed = 0;

if (!DRY) {
  // Listing the root first lets us remove files that were deleted or renamed
  // locally. Directories are intentionally left alone; this sync only owns
  // the repository root files.
  const root = await gh(`/repos/${OWNER}/${REPO}/contents/`);
  if (root.status === 200 && Array.isArray(root.json)) {
    for (const entry of root.json) {
      if (
        entry.type !== "file" ||
        isIgnoredEntry(entry.name) ||
        localFileNames.has(entry.name)
      ) {
        continue;
      }

      const remove = await gh(
        `/repos/${OWNER}/${REPO}/contents/${entry.path}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Morris Law Kernel V3.5 — remove deleted file (${entry.path})`,
            sha: entry.sha,
          }),
        },
      );

      if (remove.status === 200 || remove.status === 204) {
        deleted++;
        console.log(`  ✓ deleted ${entry.path}`);
      } else {
        failed++;
        console.log(
          `  ✗ delete ${entry.path} — HTTP ${remove.status}: ${(remove.text || "").slice(0, 160)}`,
        );
      }
    }
  } else if (root.status !== 404) {
    failed++;
    console.log(
      `  ✗ list repository root — HTTP ${root.status}: ${(root.text || "").slice(0, 160)}`,
    );
  }
}

if (failed === 0) {
  for (const f of files) {
    const localPath = join(SRC_DIR, f);
    const content = readFileSync(localPath).toString("base64");
    const repoPath = f; // repo root layout mirrors the folder

    if (DRY) {
      console.log(
        `  [dry] ${f} (${Math.round((content.length * 0.75) / 1024)} KB)`,
      );
      continue;
    }

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
      console.log(
        `  ✗ ${f} — HTTP ${put.status}: ${(put.text || "").slice(0, 160)}`,
      );
    }
  }
}

if (failed === 0) {
  console.log(`\nAll ${ok} files pushed; ${deleted} stale files deleted.`);
} else {
  console.log(`\n${ok} pushed, ${deleted} deleted, ${failed} failed.`);
}
process.exit(failed === 0 ? 0 : 1);
