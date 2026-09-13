import { performance } from "node:perf_hooks";
import {
  clearTokenTelemetryLedger,
  estimateTokenCount,
  recordTokenTelemetry,
  getTokenTelemetryLedger,
  type TokenTelemetryRecord,
} from "../src/middleware/tokenTracker.ts";

type Scenario = {
  cycle: number;
  name: string;
  rawBaselineText: string;
  actualPromptText: string;
  completionText: string;
  maxOutputTokens: number;
};

const verse = Array.from({ length: 16 }, (_, index) =>
  `Bar ${index + 1}: Gravel roads remember every tire mark and every promise.`,
).join("\n");

const scenarios: Scenario[] = [
  {
    cycle: 1,
    name: "Single Hook Prompt (Short)",
    rawBaselineText: "Write a memorable blues-rock hook about a midnight drive.",
    actualPromptText: "Write a blues-rock hook about a midnight drive.",
    completionText: "Midnight wheels, radio gold, chasing sparks down the road.",
    maxOutputTokens: 64,
  },
  {
    cycle: 2,
    name: "16-Bar Verse Generation (Medium)",
    rawBaselineText: `${verse}\nStyle notes: gritty, singable, internal rhyme, four-on-the-floor.`,
    actualPromptText: "Write a gritty 16-bar verse about a midnight drive with internal rhyme.",
    completionText: verse,
    maxOutputTokens: 512,
  },
  {
    cycle: 3,
    name: "Full Song Remix & Structure (Long)",
    rawBaselineText: Array.from(
      { length: 10 },
      (_, index) => `Section ${index + 1}: ${verse}\nArrangement notes: build, break, lift, resolve.`,
    ).join("\n"),
    actualPromptText: "Remix this song into intro, verse, pre-chorus, chorus, bridge, and outro; keep the central image.",
    completionText: [
      "## Structure",
      "- Intro: sparse guitar and room tone",
      "- Verse: restrained vocal pocket",
      "- Pre-chorus: rising harmony",
      "- Chorus: full drums and doubled hook",
      "- Bridge: half-time release",
      "- Outro: return to the opening guitar figure",
    ].join("\n"),
    maxOutputTokens: 1024,
  },
  {
    cycle: 4,
    name: "Multi-Turn Conversation History (Context-Heavy)",
    rawBaselineText: Array.from(
      { length: 24 },
      (_, index) => `Turn ${index + 1} Artist: revise the song while preserving detail ${index + 1}.`,
    ).join("\n"),
    actualPromptText: [
      "Conversation so far:",
      "Artist: keep the gravel-road image.",
      "JAX: I will keep the image and tighten the cadence.",
      "Artist: now make the chorus easier to sing.",
      "Artist: return the revised chorus.",
    ].join("\n"),
    completionText: "Gravel road, carry me home / Every mile becomes a song.",
    maxOutputTokens: 512,
  },
  {
    cycle: 5,
    name: "High-Density Lyric Rewrite (Stress)",
    rawBaselineText: Array.from(
      { length: 40 },
      (_, index) => `Dense lyric block ${index + 1}: asphalt, rain, neon, memory, distance, rhythm, return.`,
    ).join("\n"),
    actualPromptText: "Rewrite the dense lyric for tighter meter, stronger consonants, and a singable chorus.",
    completionText: Array.from(
      { length: 12 },
      (_, index) => `Line ${index + 1}: rain on the windshield, fire in the wire.`,
    ).join("\n"),
    maxOutputTokens: 768,
  },
];

function formatRecord(scenario: Scenario, record: TokenTelemetryRecord): string {
  return [
    String(scenario.cycle).padStart(5),
    scenario.name.padEnd(40),
    String(record.raw_tokens_baseline).padStart(9),
    String(record.prompt_tokens).padStart(7),
    String(record.completion_tokens).padStart(11),
    String(record.actual_tokens_used).padStart(7),
    String(record.tokens_suppressed).padStart(11),
    `${record.suppression_percentage.toFixed(2)}%`.padStart(9),
    `${record.latency_overhead_ms.toFixed(4)}ms`.padStart(12),
  ].join(" | ");
}

clearTokenTelemetryLedger();
const records = scenarios.map((scenario) => {
  const startedAt = performance.now();
  return recordTokenTelemetry({
    operation: "simulation",
    rawBaselineText: scenario.rawBaselineText,
    actualPromptText: scenario.actualPromptText,
    completionText: scenario.completionText,
    maxOutputTokens: scenario.maxOutputTokens,
    provider: "native_simulation",
    startedAt,
  });
});

if (records.length !== 5 || getTokenTelemetryLedger().length !== 5) {
  throw new Error("Token telemetry ledger did not persist all five simulation records.");
}
if (records.some((record) => record.latency_overhead_ms >= 1)) {
  throw new Error("Token telemetry bookkeeping exceeded the <1ms overhead guard.");
}
if (records.some((record) => record.actual_tokens_used !== record.prompt_tokens + record.completion_tokens)) {
  throw new Error("Actual token arithmetic is inconsistent.");
}
if (records.some((record) => record.tokens_suppressed !== Math.max(0, record.raw_tokens_baseline - record.actual_tokens_used))) {
  throw new Error("Suppressed token arithmetic is inconsistent.");
}

console.log("GKA TELEMETRY FORMAT");
console.log("Cycle | Scenario                                 | RawBase | Prompt | Completion | Actual | Suppressed | Suppress% | Overhead");
for (let index = 0; index < scenarios.length; index += 1) {
  console.log(formatRecord(scenarios[index], records[index]));
}
console.log("");
console.log(`Ledger records: ${getTokenTelemetryLedger().length}`);
console.log(`Measured token estimator: native/zero-dependency (${estimateTokenCount("GKA") > 0 ? "active" : "inactive"})`);
console.log("[REPLIT-SELF-AUDIT: COMPLETE // 0 ERRORS // RUNTIME GREEN]");