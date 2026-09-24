import { createHash, timingSafeEqual } from "node:crypto";

export type TelemetryReportSchedule = "daily" | "weekly" | "monthly";

export type TelemetryClientConfig = {
  clientId: string;
  tokenSha256: string;
  email?: string;
  schedule?: TelemetryReportSchedule;
  timezone: string;
};

type RawTelemetryClientConfig = {
  clientId?: unknown;
  token?: unknown;
  tokenSha256?: unknown;
  email?: unknown;
  schedule?: unknown;
  timezone?: unknown;
};

const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MIN_CAPABILITY_TOKEN_LENGTH = 24;

function hashCapabilityToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isSchedule(value: unknown): value is TelemetryReportSchedule {
  return value === "daily" || value === "weekly" || value === "monthly";
}

function normalizeEntry(raw: RawTelemetryClientConfig): TelemetryClientConfig | null {
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  if (!clientId) return null;

  const plainToken = typeof raw.token === "string" ? raw.token.trim() : "";
  const configuredHash =
    typeof raw.tokenSha256 === "string" ? raw.tokenSha256.trim().toLowerCase() : "";
  const tokenSha256 = configuredHash && TOKEN_HASH_PATTERN.test(configuredHash)
    ? configuredHash
    : plainToken.length >= MIN_CAPABILITY_TOKEN_LENGTH
      ? hashCapabilityToken(plainToken)
      : "";
  if (!tokenSha256) return null;

  const email = typeof raw.email === "string" && raw.email.trim()
    ? raw.email.trim()
    : undefined;
  const schedule = isSchedule(raw.schedule) ? raw.schedule : undefined;
  const timezone = typeof raw.timezone === "string" && raw.timezone.trim()
    ? raw.timezone.trim()
    : "UTC";

  return { clientId, tokenSha256, email, schedule, timezone };
}

/**
 * Parse the capability-token mapping from environment configuration.
 *
 * Shape:
 * [{"clientId":"client-a","tokenSha256":"<sha256>","email":"ops@example.com",
 *   "schedule":"weekly","timezone":"America/Chicago"}]
 *
 * A `token` field is also accepted for secrets-managed plaintext tokens. The
 * returned structure contains only its hash.
 */
export function loadTelemetryClientConfigs(
  serialized = process.env.GKA_LIVE_TELEMETRY_CLIENTS,
): TelemetryClientConfig[] {
  if (!serialized?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    console.error("GKA live telemetry client configuration is invalid JSON");
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error("GKA live telemetry client configuration must be an array");
    return [];
  }

  const configs = parsed
    .map((entry) =>
      entry && typeof entry === "object"
        ? normalizeEntry(entry as RawTelemetryClientConfig)
        : null,
    )
    .filter((entry): entry is TelemetryClientConfig => Boolean(entry));

  if (configs.length !== parsed.length) {
    console.error("One or more GKA live telemetry client entries were rejected");
  }
  const hashCounts = new Map<string, number>();
  for (const config of configs) {
    hashCounts.set(config.tokenSha256, (hashCounts.get(config.tokenSha256) ?? 0) + 1);
  }
  const uniqueConfigs = configs.filter(
    (config) => hashCounts.get(config.tokenSha256) === 1,
  );
  if (uniqueConfigs.length !== configs.length) {
    console.error("Duplicate GKA live telemetry capability tokens were rejected");
  }
  return uniqueConfigs;
}

/**
 * Constant-time capability lookup. All configured hashes are compared before a
 * match is returned, preventing early-exit timing from identifying an entry.
 */
export function resolveTelemetryClient(
  presentedToken: string,
  configs = loadTelemetryClientConfigs(),
): TelemetryClientConfig | null {
  const token = presentedToken.trim();
  if (!token) return null;
  const presentedHash = Buffer.from(hashCapabilityToken(token), "hex");
  let matched: TelemetryClientConfig | null = null;

  for (const config of configs) {
    const configuredHash = Buffer.from(config.tokenSha256, "hex");
    if (
      configuredHash.length === presentedHash.length &&
      timingSafeEqual(configuredHash, presentedHash)
    ) {
      matched = config;
    }
  }
  return matched;
}