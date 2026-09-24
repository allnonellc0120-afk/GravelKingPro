#!/usr/bin/env node
/**
 * Record one uninterrupted terminal session for the GKA enterprise demo.
 * This intentionally does not create scenes, cards, slides, or timestamp cuts.
 */
import { chromium } from "playwright";
import { createInterface } from "node:readline";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const output = path.resolve(workspace, "artifacts/gka_enterprise_code_demo.mp4");
const workloadScript = path.resolve(workspace, "run-agent-workload.sh");
const temp = path.resolve(workspace, ".tmp-gka-terminal-session");
const width = 1920;
const height = 1080;
const fps = 60;

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: "inherit", ...options });
}

function findChromium() {
  try {
    return execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  } catch {}
  const candidates = [
    "/nix/store/hvv3n9pvjfq0x8wjw8f3igsyvlaz1ngr-playwright-browsers-chromium/chromium-1091/chrome-linux/chrome",
    "/nix/store/gn1jv0wpg8zq97a48bqd5k5ck8hf0n2y-playwright-browsers-chromium/chromium-1048/chrome-linux/chrome",
    "/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function terminalHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #101316; }
  body {
    color: #d7e2e8;
    font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
    font-size: 25px;
    line-height: 1.36;
    letter-spacing: 0.01em;
    text-rendering: geometricPrecision;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,.018) 0 1px, transparent 1px 4px);
    mix-blend-mode: screen;
    opacity: .25;
  }
  #terminal {
    height: 100vh;
    padding: 44px 68px 64px;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-word;
    text-shadow: 0 0 10px rgba(105, 222, 181, .08);
  }
  .line { min-height: 1.36em; }
  .prompt { color: #75f0b0; }
  .command { color: #f3c969; }
  .json { color: #b9d6e2; }
  .metric { color: #6fe6e9; }
  .success { color: #79efad; }
  .muted { color: #7b8a93; }
  .error { color: #ff7e88; }
  .cursor {
    display: inline-block;
    width: .62em;
    height: 1.05em;
    margin-left: .18em;
    vertical-align: -.14em;
    background: #75f0b0;
    animation: blink 1s steps(2, start) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
</style>
</head>
<body>
  <main id="terminal" aria-label="GKA live terminal session"></main>
<script>
  const terminal = document.getElementById("terminal");
  let cursor;
  window.writeTerminalLine = (value) => {
    if (cursor) cursor.remove();
    const line = document.createElement("div");
    line.className = "line";
    const text = String(value);
    if (text.startsWith("$ ")) line.className += " command";
    else if (text.includes("TOKENS") || text.includes("suppressed") || text.includes("SUPPRESSION")) line.className += " metric";
    else if (text.includes("PASS") || text.includes("VALIDATED") || text.includes("0 errors")) line.className += " success";
    else if (text.startsWith("{") || text.startsWith("}") || text.startsWith("  ")) line.className += " json";
    else if (text.startsWith("[")) line.className += " muted";
    line.textContent = text;
    terminal.appendChild(line);
    cursor = document.createElement("span");
    cursor.className = "cursor";
    terminal.appendChild(cursor);
    terminal.scrollTop = terminal.scrollHeight;
  };
</script>
</body>
</html>`;
}

async function recordTerminal() {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });

  const browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: temp, size: { width, height } },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("Browser page error:", error.message));
  await page.setContent(terminalHtml(), { waitUntil: "load" });
  await page.waitForTimeout(200);

  await page.evaluate(() => window.writeTerminalLine("GKA // CUSTOMER ZERO // CONTINUOUS CLI SESSION"));
  await page.evaluate(() => window.writeTerminalLine("Morris Law Kernel V2 · js-tiktoken cl100k_base initialized"));
  await page.evaluate(() => window.writeTerminalLine("proxy listening on :8090 · ledger: artifacts/api-server/data/token_savings_ledger.jsonl"));

  const child = spawn("bash", [workloadScript, "--workload", "enterprise-code-refactor"], {
    cwd: workspace,
    env: { ...process.env, TERM: "xterm-256color", COLUMNS: "110", LINES: "36" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const childClosed = new Promise((resolve) => child.once("close", resolve));
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const lines = createInterface({ input: child.stdout });
  for await (const line of lines) {
    await page.evaluate((nextLine) => window.writeTerminalLine(nextLine), line);
    const pause = line.startsWith("$ ") ? 240 : (line.startsWith("{") || line.startsWith("  ") ? 42 : 115);
    await page.waitForTimeout(pause);
  }
  const exitCode = child.exitCode ?? await childClosed;
  if (exitCode !== 0) throw new Error(`Workload command failed (${exitCode}): ${stderr}`);

  await page.evaluate(() => window.writeTerminalLine(""));
  await page.evaluate(() => window.writeTerminalLine("session complete · clean exit"));
  await page.waitForTimeout(2200);

  const video = page.video();
  await context.close();
  const recordedPath = await video.path();
  await browser.close();
  return recordedPath;
}

async function main() {
  if (!fs.existsSync(workloadScript)) throw new Error(`Missing workload command: ${workloadScript}`);
  fs.chmodSync(workloadScript, 0o755);
  console.log("Recording uninterrupted terminal session at 1920x1080...");
  const webm = await recordTerminal();
  console.log("Encoding terminal capture to 60fps H.264/AAC MP4...");
  run("ffmpeg", [
    "-y", "-i", webm, "-f", "lavfi", "-i",
    "aevalsrc=0.025*sin(2*PI*55*t)+0.008*sin(2*PI*110*t)+0.004*sin(2*PI*220*t):s=48000:d=90",
    "-map", "0:v:0", "-map", "1:a:0",
    "-vf", "fps=60,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-level", "4.2",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", output,
  ]);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`Done: ${output}`);
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(temp, { recursive: true, force: true });
  process.exit(1);
});