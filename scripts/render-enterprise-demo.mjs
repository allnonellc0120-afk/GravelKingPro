#!/usr/bin/env node
/**
 * Render the nine-frame GKA enterprise demo as a readable 45-second MP4.
 * Every frame is a static five-second terminal card so the metrics are legible.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const output = path.resolve(workspace, "artifacts/gka_enterprise_code_demo.mp4");
const temp = path.resolve(workspace, ".tmp-gka-enterprise-demo");
const width = 1920;
const height = 1080;
const fps = 30;
const frames = [
  {
    number: 1,
    range: "00:00 — 00:05",
    headline: "ENTERPRISE CODE AGENT // FULL CONTEXT INBOUND",
    subline: "600-line TypeScript AST refactor · compiler errors · shell logs",
    rows: ["INPUT CHANNEL", "FULL CODEBASE RE-TRANSMITTED", "GKA STATUS", "LISTENING"],
    metric: "RAW CONTEXT",
    value: "15,921 TOKENS",
  },
  {
    number: 2,
    range: "00:05 — 00:10",
    headline: "TURN 1 // FIRST COMPILE FAILURE",
    subline: "The agent receives the complete repository and identifies TS2322.",
    rows: ["ERROR", "TS2322 / AST NODE TYPE MISMATCH", "ACTION", "PRESERVE BEHAVIOR + TYPES"],
    metric: "BASELINE",
    value: "15,921",
  },
  {
    number: 3,
    range: "00:10 — 00:15",
    headline: "TURN 2 // STALE HISTORY CARVED",
    subline: "Instructions stay. Historical assistant turns and duplicate context leave.",
    rows: ["RAW HISTORY", "31,593 TOKENS", "PROCESSED", "16,485 TOKENS"],
    metric: "SUPPRESSED",
    value: "15,108",
  },
  {
    number: 4,
    range: "00:15 — 00:20",
    headline: "TURN 3 // THE ACTIVE TURN SURVIVES",
    subline: "GKA keeps the current code question and removes redundant history.",
    rows: ["RAW HISTORY", "47,344 TOKENS", "PROCESSED", "16,564 TOKENS"],
    metric: "SUPPRESSION",
    value: "65.01%",
  },
  {
    number: 5,
    range: "00:20 — 00:25",
    headline: "TURN 4 // FINAL PATCH REVIEW",
    subline: "The refactor is ready to merge with compiler output at zero errors.",
    rows: ["BASH", "tsc --noEmit", "RESULT", "0 ERRORS · READY TO MERGE"],
    metric: "SUPPRESSION",
    value: "73.78%",
  },
  {
    number: 6,
    range: "00:25 — 00:30",
    headline: "GKA CARVE // 92,424 TOKENS SUPPRESSED",
    subline: "Four turns · exact BPE accounting · no prompt contents stored.",
    rows: ["RAW IN", "157,923", "CARVED", "65,499"],
    metric: "TOKENS REMOVED",
    value: "92,424",
  },
  {
    number: 7,
    range: "00:30 — 00:35",
    headline: "EXACT BPE // CL100K_BASE",
    subline: "Durable telemetry uses js-tiktoken and the configured $3.00/M rate.",
    rows: ["TOKENIZER", "js-tiktoken / cl100k_base", "RATE", "$3.00 / 1M TOKENS"],
    metric: "LEDGER",
    value: "ACTIVE",
  },
  {
    number: 8,
    range: "00:35 — 00:40",
    headline: "$0.277272 SAVED // $0.091500 GKA SHARE",
    subline: "The JSONL ledger registers the 67/33 split after the live request.",
    rows: ["DOLLARS SAVED", "$0.277272", "GKA 33% DUE", "$0.091500"],
    metric: "CASH REGISTER",
    value: "VERIFIED",
  },
  {
    number: 9,
    range: "00:40 — 00:45",
    headline: "GKA CUSTOMER ZERO // READY TO MERGE",
    subline: "Exact counts · durable ledger · readable proof for enterprise review.",
    rows: ["RAW", "157,923", "PROCESSED", "65,499"],
    metric: "SUPPRESSION",
    value: "58.52% PASS",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgText(text, x, y, size, color, weight = 400, anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(text)}</text>`;
}

function renderFrame(frame, framePath) {
  const grid = [];
  for (let x = 80; x < width; x += 80) grid.push(`<path d="M ${x} 0 V ${height}" />`);
  for (let y = 80; y < height; y += 80) grid.push(`<path d="M 0 ${y} H ${width}" />`);
  const rows = frame.rows.map((row, index) => {
    const y = 442 + index * 70;
    const color = index % 2 === 0 ? "#91a4b7" : "#f3f7fb";
    return svgText(row, 170, y, 32, color, index % 2 === 0 ? 400 : 700);
  }).join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#05080d"/>
  <g stroke="#10202a" stroke-width="1" opacity="0.72">${grid.join("")}</g>
  <rect x="70" y="60" width="1780" height="960" rx="24" fill="#071019" stroke="#1b4551" stroke-width="3"/>
  <rect x="70" y="60" width="1780" height="82" rx="24" fill="#0b1821"/>
  <circle cx="116" cy="101" r="11" fill="#7dffb2"/>
  <circle cx="150" cy="101" r="11" fill="#f5c96a"/>
  <circle cx="184" cy="101" r="11" fill="#e86f7a"/>
  ${svgText("GKA // CUSTOMER ZERO AUDIT", 235, 111, 27, "#91a4b7", 700)}
  ${svgText(frame.range, 1770, 111, 25, "#91a4b7", 700, "end")}
  ${svgText(`FRAME ${String(frame.number).padStart(2, "0")} / 09`, 125, 214, 25, "#7dffb2", 700)}
  ${svgText(frame.headline, 125, 300, 58, "#f3f7fb", 700)}
  ${svgText(frame.subline, 125, 354, 29, "#91a4b7", 400)}
  <rect x="125" y="395" width="1120" height="410" rx="16" fill="#08131b" stroke="#1f4e59" stroke-width="2"/>
  ${svgText("TERMINAL PAYLOAD // LIVE", 170, 425, 23, "#5ce1e6", 700)}
  ${rows}
  <rect x="1320" y="395" width="445" height="410" rx="16" fill="#0b1a20" stroke="#2c856f" stroke-width="2"/>
  ${svgText(frame.metric, 1542, 500, 26, "#91a4b7", 700, "middle")}
  ${svgText(frame.value, 1542, 610, 48, "#7dffb2", 700, "middle")}
  <path d="M 1400 660 H 1685" stroke="#2c856f" stroke-width="4"/>
  ${svgText("GKA PARITY LOCK // VALIDATED", 1542, 735, 22, "#5ce1e6", 700, "middle")}
  ${svgText("MORRIS LAW KERNEL V2 · EXACT LEDGER TELEMETRY", 125, 945, 22, "#607786", 700)}
  ${svgText("STATIC FRAME // 5.0s DWELL", 1770, 945, 22, "#607786", 700, "end")}
</svg>`;
  fs.writeFileSync(framePath, svg);
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

const segments = [];
for (const frame of frames) {
  const svgPath = path.join(temp, `frame-${frame.number}.svg`);
  const pngPath = path.join(temp, `frame-${frame.number}.png`);
  const segmentPath = path.join(temp, `segment-${frame.number}.mp4`);
  renderFrame(frame, svgPath);
  run("convert", [svgPath, "-background", "#05080d", pngPath]);
  run("ffmpeg", [
    "-y", "-loop", "1", "-i", pngPath, "-frames:v", String(fps * 5),
    "-r", String(fps), "-c:v", "libx264", "-preset", "ultrafast",
    "-crf", "18", "-pix_fmt", "yuv420p", segmentPath,
  ]);
  segments.push(segmentPath);
}

const concatPath = path.join(temp, "concat.txt");
fs.writeFileSync(concatPath, segments.map((segment) => `file '${segment}'`).join("\n") + "\n");
const videoPath = path.join(temp, "video-only.mp4");
const audioPath = path.join(temp, "audio.m4a");
run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", videoPath]);
run("ffmpeg", [
  "-y", "-f", "lavfi", "-i",
  "aevalsrc=0.035*sin(2*PI*55*t)+0.012*sin(2*PI*110*t)+0.006*sin(2*PI*220*t):s=48000:d=45",
  "-t", "45", "-af", "loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=in:st=0:d=0.5,afade=t=out:st=43.5:d=1.5",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", audioPath,
]);
run("ffmpeg", [
  "-y", "-i", videoPath, "-i", audioPath,
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-t", "45", "-movflags", "+faststart", output,
]);

fs.rmSync(temp, { recursive: true, force: true });
console.log(`Rendered ${output}`);