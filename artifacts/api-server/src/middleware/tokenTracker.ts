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
let nextRecordId = 1;

/**
 * Native, dependency-free approximation of model tokenization. Four
 * characters per token is the stable lower-overhead ratio used by the
 * simulation and avoids allocating a tokenizer object on every request.
 */
export function estimateTokenCount(text: string): number {
  const normalizedLength = text.trim().length;
  return normalizedLength === 0 ? 0 : Math.ceil(normalizedLength / 4);
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

  const record = {
    id: `gka-token-${nextRecordId++}`,
    operation: input.operation,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    raw_tokens_baseline: rawTokensBaseline,
    actual_tokens_used: actualTokensUsed,
    tokens_suppressed: tokensSuppressed,
    suppression_percentage: rawTokensBaseline > 0
      ? Number(((tokensSuppressed / rawTokensBaseline) * 100).toFixed(2))
      : 0,
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