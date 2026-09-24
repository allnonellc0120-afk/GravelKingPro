import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { performance } from "perf_hooks";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getEncoding } from "js-tiktoken";

export type TokenTelemetryRecord = {
  id: string;
  operation: "jax_generate" | "jax_remix" | "simulation";
  client_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  raw_prompt_tokens: number;
  processed_prompt_tokens: number;
  raw_tokens_baseline: number;
  actual_tokens_used: number;
  tokens_suppressed: number;
  suppression_percentage: number;
  token_rate_per_million_usd: number;
  dollar_savings: number;
  gka_gain_share_due: number;
  latency_overhead_ms: number;
  provider?: string;
  status: "completed" | "failed";
  created_at: string;
};

export type TokenTelemetryInput = {
  operation: TokenTelemetryRecord["operation"];
  rawBaselineText: string;
  actualPromptText: string;
  maxOutputTokens?: number;
  provider?: string;
  clientId?: string;
  modelRatePerMillionUsd?: number;
};

const MAX_LEDGER_RECORDS = 10_000;
const DEFAULT_TOKEN_RATE_PER_MILLION_USD = 2.5;
const GKA_GAIN_SHARE_RATE = 0.33;
const tokenEncoding = getEncoding("cl100k_base");
const ledger: TokenTelemetryRecord[] = [];
let nextRecordId = 1;
let ledgerWriteQueue: Promise<void> = Promise.resolve();

function defaultLedgerPath(): string {
  const workingDirectory = process.cwd();
  const artifactRoot =
    path.basename(workingDirectory) === "api-server"
      ? workingDirectory
      : path.resolve(workingDirectory, "artifacts/api-server");
  return path.resolve(artifactRoot, "data/token_savings_ledger.jsonl");
}

export const TOKEN_LEDGER_PATH =
  process.env.GKA_TOKEN_LEDGER_PATH?.trim() || defaultLedgerPath();

/**
 * Exact cl100k_base BPE tokenization used for the current model-cost ledger.
 * The encoder is cached once per process so request bookkeeping stays cheap.
 */
export function countTokens(text: string): number {
  return tokenEncoding.encode(text).length;
}

function persistRecord(record: TokenTelemetryRecord): TokenTelemetryRecord {
  ledger.push(record);
  if (ledger.length > MAX_LEDGER_RECORDS) ledger.splice(0, ledger.length - MAX_LEDGER_RECORDS);
  ledgerWriteQueue = ledgerWriteQueue
    .then(async () => {
      await mkdir(path.dirname(TOKEN_LEDGER_PATH), { recursive: true });
      await appendFile(TOKEN_LEDGER_PATH, `${JSON.stringify(record)}\n`, "utf8");
    })
    .catch((error: unknown) => {
      console.error("Token telemetry ledger append failed", {
        error,
        ledgerPath: TOKEN_LEDGER_PATH,
        recordId: record.id,
      });
    });
  return record;
}

export function getTokenTelemetryLedger(): readonly TokenTelemetryRecord[] {
  return ledger;
}

export function clearTokenTelemetryLedger(): void {
  ledger.length = 0;
}

export async function flushTokenTelemetryLedger(): Promise<void> {
  await ledgerWriteQueue;
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}

export async function readTokenTelemetryLedger(
  clientId?: string,
): Promise<TokenTelemetryRecord[]> {
  await flushTokenTelemetryLedger();

  let contents: string;
  try {
    contents = await readFile(TOKEN_LEDGER_PATH, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) return [];
    throw error;
  }

  const records = contents
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line) as TokenTelemetryRecord;
      } catch (error) {
        throw new Error(`Invalid token telemetry ledger record at line ${index + 1}`, {
          cause: error,
        });
      }
    });

  return clientId ? records.filter((record) => record.client_id === clientId) : records;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

export async function getTokenTelemetryLedgerSummary(clientId?: string) {
  const records = await readTokenTelemetryLedger(clientId);
  const totals = records.reduce(
    (summary, record) => {
      summary.totalRawTokens += record.raw_prompt_tokens ?? record.raw_tokens_baseline;
      summary.totalCarvedTokens += record.processed_prompt_tokens ?? record.prompt_tokens;
      summary.totalTokensSuppressed += record.tokens_suppressed;
      summary.totalDollarsSaved += record.dollar_savings ?? 0;
      summary.totalGkaGainShareDue += record.gka_gain_share_due ?? 0;
      return summary;
    },
    {
      totalRawTokens: 0,
      totalCarvedTokens: 0,
      totalTokensSuppressed: 0,
      totalDollarsSaved: 0,
      totalGkaGainShareDue: 0,
    },
  );

  return {
    clientId: clientId ?? null,
    recordCount: records.length,
    totalRawTokens: totals.totalRawTokens,
    totalCarvedTokens: totals.totalCarvedTokens,
    totalTokensSuppressed: totals.totalTokensSuppressed,
    totalDollarsSaved: roundMoney(totals.totalDollarsSaved),
    totalGkaGainShareDue: roundMoney(totals.totalGkaGainShareDue),
  };
}

export function recordTokenTelemetry(
  input: TokenTelemetryInput & {
    completionText: string;
    status?: TokenTelemetryRecord["status"];
    startedAt?: number;
  },
): TokenTelemetryRecord {
  const startedAt = input.startedAt ?? performance.now();
  const promptTokens = countTokens(input.actualPromptText);
  const completionTokens = countTokens(input.completionText);
  const rawPromptTokens = countTokens(input.rawBaselineText);
  const tokensSuppressed = Math.max(0, rawPromptTokens - promptTokens);
  const configuredTokenRate = Number(process.env.GKA_TOKEN_RATE_PER_MILLION_USD);
  const tokenRatePerMillionUsd =
    Number.isFinite(input.modelRatePerMillionUsd) && (input.modelRatePerMillionUsd ?? 0) >= 0
      ? input.modelRatePerMillionUsd!
      : Number.isFinite(configuredTokenRate) && configuredTokenRate >= 0
        ? configuredTokenRate
        : DEFAULT_TOKEN_RATE_PER_MILLION_USD;
  const dollarSavings = roundMoney((tokensSuppressed / 1_000_000) * tokenRatePerMillionUsd);

  const record = {
    id: `gka-token-${nextRecordId++}`,
    operation: input.operation,
    client_id: input.clientId ?? null,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    raw_prompt_tokens: rawPromptTokens,
    processed_prompt_tokens: promptTokens,
    raw_tokens_baseline: rawPromptTokens,
    actual_tokens_used: promptTokens + completionTokens,
    tokens_suppressed: tokensSuppressed,
    suppression_percentage: rawPromptTokens > 0
      ? Number(((tokensSuppressed / rawPromptTokens) * 100).toFixed(2))
      : 0,
    token_rate_per_million_usd: tokenRatePerMillionUsd,
    dollar_savings: dollarSavings,
    gka_gain_share_due: roundMoney(dollarSavings * GKA_GAIN_SHARE_RATE),
    latency_overhead_ms: 0,
    provider: input.provider,
    status: input.status ?? "completed",
    created_at: new Date().toISOString(),
  } satisfies TokenTelemetryRecord;
  persistRecord(record);
  record.latency_overhead_ms = Number((performance.now() - startedAt).toFixed(4));
  return record;
}

export type TokenTracker = {
  finish: (completionText: string, options?: {
    provider?: string;
    status?: TokenTelemetryRecord["status"];
  }) => TokenTelemetryRecord;
  record?: TokenTelemetryRecord;
};

export function beginTokenTracking(input: TokenTelemetryInput): TokenTracker {
  let record: TokenTelemetryRecord | undefined;
  return {
    finish(completionText, options = {}) {
      if (record) return record;
      record = recordTokenTelemetry({
        ...input,
        completionText,
        // Start after the provider returns so this measures only telemetry
        // bookkeeping, never model execution latency.
        startedAt: performance.now(),
        provider: options.provider ?? input.provider,
        status: options.status,
      });
      return record;
    },
    get record() {
      return record;
    },
  };
}

/**
 * Route middleware that creates a request-scoped tracker. JAX sets the
 * uncompressed and actual prompt boundaries after it has assembled the system
 * prompt; response bookkeeping remains explicit so SSE and JSON both work.
 */
export function tokenTrackerMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.locals.tokenTelemetryRequestStartedAt = performance.now();
  res.locals.tokenTelemetryRequestId = req.header("x-request-id") ?? randomUUID();
  next();
}