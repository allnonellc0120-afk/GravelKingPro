/**
 * Regression coverage for exact BPE token accounting and durable gain-share
 * arithmetic. The test isolates the JSONL path so it never mutates the active
 * production ledger.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gka-token-telemetry-"));
  process.env.GKA_TOKEN_LEDGER_PATH = path.join(tempDir, "token_savings_ledger.jsonl");

  try {
    const {
      countTokens,
      flushTokenTelemetryLedger,
      getTokenTelemetryLedgerSummary,
      recordTokenTelemetry,
      TOKEN_LEDGER_PATH,
    } = await import("../middleware/tokenTracker");

    check("cl100k_base counts hello world as 2 tokens", countTokens("hello world") === 2);
    check("cl100k_base counts hello as 1 token", countTokens("hello") === 1);

    const record = recordTokenTelemetry({
      operation: "simulation",
      clientId: "token-telemetry-regression",
      rawBaselineText: "hello world",
      actualPromptText: "hello",
      completionText: "!",
      modelRatePerMillionUsd: 3,
    });

    check("raw prompt token count is exact", record.raw_prompt_tokens === 2);
    check("processed prompt token count is exact", record.processed_prompt_tokens === 1);
    check("suppressed token count is raw minus processed", record.tokens_suppressed === 1);
    check("configured financial rate is applied", record.token_rate_per_million_usd === 3);
    check("dollar savings uses the configured rate", record.dollar_savings === 0.000003);
    check("GKA share is exactly 33% of dollar savings", record.gka_gain_share_due === 0.000001);

    await flushTokenTelemetryLedger();
    const ledgerContents = await readFile(TOKEN_LEDGER_PATH, "utf8");
    check("completed record is appended to JSONL", ledgerContents.trim().split("\n").length === 1);

    const summary = await getTokenTelemetryLedgerSummary("token-telemetry-regression");
    check("ledger summary reads persisted raw tokens", summary.totalRawTokens === 2);
    check("ledger summary reads persisted carved tokens", summary.totalCarvedTokens === 1);
    check("ledger summary reads persisted savings", summary.totalDollarsSaved === 0.000003);
    check("ledger summary reads persisted gain share", summary.totalGkaGainShareDue === 0.000001);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(`\ntoken-telemetry.test: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});