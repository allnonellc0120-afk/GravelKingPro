import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { performance } from "perf_hooks";

export type TokenTelemetryRecord = {
  id: string;
  operation: "jax_generate" | "jax_remix" | "simulation";
  prompt_tokens: number;
  completion_tokens: number;
  raw_tokens_baseline: number;
  actual_tokens_used: number;
  tokens_suppressed: number;
  suppression_percentage: number;
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
};

const MAX_LEDGER_RECORDS = 10_000;
const ledger: TokenTelemetryRecord[] = [];

/**
 * Native, dependency-free approximation of model tokenization. It deliberately
 * counts punctuation and long words in small chunks instead of treating one
 * whitespace-delimited word as one token.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .reduce((total, word) => total + Math.max(1, Math.ceil(Array.from(word).length / 4)), 0);
}

function persistRecord(record: TokenTelemetryRecord): TokenTelemetryRecord {
  ledger.push(record);
  if (ledger.length > MAX_LEDGER_RECORDS) ledger.splice(0, ledger.length - MAX_LEDGER_RECORDS);
  return record;
}

export function getTokenTelemetryLedger(): readonly TokenTelemetryRecord[] {
  return ledger;
}

export function clearTokenTelemetryLedger(): void {
  ledger.length = 0;
}

export function recordTokenTelemetry(
  input: TokenTelemetryInput & {
    completionText: string;
    status?: TokenTelemetryRecord["status"];
    startedAt?: number;
  },
): TokenTelemetryRecord {
  const startedAt = input.startedAt ?? performance.now();
  const promptTokens = estimateTokenCount(input.actualPromptText);
  const completionTokens = estimateTokenCount(input.completionText);
  const rawContextTokens = estimateTokenCount(input.rawBaselineText);
  const rawTokensBaseline = rawContextTokens + Math.max(0, input.maxOutputTokens ?? 0);
  const actualTokensUsed = promptTokens + completionTokens;
  const tokensSuppressed = Math.max(0, rawTokensBaseline - actualTokensUsed);

  return persistRecord({
    id: randomUUID(),
    operation: input.operation,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    raw_tokens_baseline: rawTokensBaseline,
    actual_tokens_used: actualTokensUsed,
    tokens_suppressed: tokensSuppressed,
    suppression_percentage: rawTokensBaseline > 0
      ? Number(((tokensSuppressed / rawTokensBaseline) * 100).toFixed(2))
      : 0,
    latency_overhead_ms: Number((performance.now() - startedAt).toFixed(4)),
    provider: input.provider,
    status: input.status ?? "completed",
    created_at: new Date().toISOString(),
  });
}

export type TokenTracker = {
  finish: (completionText: string, options?: {
    provider?: string;
    status?: TokenTelemetryRecord["status"];
  }) => TokenTelemetryRecord;
  record?: TokenTelemetryRecord;
};

export function beginTokenTracking(input: TokenTelemetryInput): TokenTracker {
  const startedAt = performance.now();
  let record: TokenTelemetryRecord | undefined;
  return {
    finish(completionText, options = {}) {
      if (record) return record;
      record = recordTokenTelemetry({
        ...input,
        completionText,
        startedAt,
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