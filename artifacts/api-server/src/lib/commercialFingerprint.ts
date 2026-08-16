import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 20_000;

export interface CommercialFingerprintMatch {
  title?: string | null;
  artists?: string[];
  album?: string | null;
  isrc?: string | null;
  score?: number | null;
  acr_id?: string | null;
}

export type CommercialFingerprintResult =
  | { status: "no_match"; provider: "acrcloud"; matches: []; scope: "global_commercial" }
  | { status: "match"; provider: "acrcloud"; matches: CommercialFingerprintMatch[] }
  | { status: "local_no_match"; provider: "local-signature"; matches: []; scope: "local_catalog"; signature: string }
  | { status: "unavailable"; provider: "acrcloud" | "local-signature"; reason: string };

interface GatewayResponse {
  status?: string;
  provider?: string;
  matches?: CommercialFingerprintMatch[];
  code?: string;
  message?: string;
}

function serviceBaseUrl(): string | null {
  const raw = process.env["FINGERPRINT_SERVICE_URL"]?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

function timeoutMs(): number {
  const configured = Number(process.env["FINGERPRINT_SCAN_TIMEOUT_MS"]);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(60_000, Math.max(5_000, configured));
}

async function cloudRunIdentityHeaders(
  audience: string,
  requestUrl: string,
): Promise<Record<string, string>> {
  const parsed = new URL(audience);
  if (
    process.env["FINGERPRINT_CLOUD_RUN_IAM"] === "false" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1"
  ) {
    return {};
  }

  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(audience);
  const authHeaders = await client.getRequestHeaders(requestUrl);
  const headers: Record<string, string> = {};
  authHeaders.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * Normalize the first 12 seconds before sending to Cloud Run. This keeps the
 * request far below Cloud Run's body limit even when the original upload is a
 * large WAV/video and follows ACRCloud's recommendation to submit short clips.
 */
async function makeScanSample(filePath: string): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const path = `/tmp/gkp_fingerprint_${randomUUID()}.wav`;
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      filePath,
      "-t",
      "12",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-c:a",
      "pcm_s16le",
      path,
    ],
    { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
  );
  return { path, cleanup: () => unlink(path).catch(() => {}) };
}

/**
 * Account-free fallback. This is intentionally a local signature scan, not a
 * claim of worldwide copyright clearance. It hashes a normalized audio sample
 * so the app can detect exact duplicates in any locally maintained reference
 * catalog while clearly leaving global commercial matching unchecked.
 */
async function scanLocalSignature(
  filePath: string,
): Promise<Extract<CommercialFingerprintResult, { status: "local_no_match" }>> {
  let sample: Awaited<ReturnType<typeof makeScanSample>> | null = null;
  try {
    sample = await makeScanSample(filePath);
    const bytes = await readFile(sample.path);
    const signature = createHash("sha256").update(bytes).digest("hex");
    return {
      status: "local_no_match",
      provider: "local-signature",
      scope: "local_catalog",
      signature,
      matches: [],
    };
  } finally {
    await sample?.cleanup();
  }
}

/**
 * Scan an audio file through the dedicated ACRCloud Cloud Run gateway.
 *
 * This function never throws provider/network/configuration errors. Those are
 * normalized to `unavailable`, allowing callers to block only the protected
 * stamp while all unrelated application routes remain healthy.
 */
export async function scanCommercialFingerprint(
  filePath: string,
): Promise<CommercialFingerprintResult> {
  const baseUrl = serviceBaseUrl();
  const serviceKey = process.env["FINGERPRINT_SERVICE_API_KEY"]?.trim();
  if (!baseUrl || !serviceKey) {
    return scanLocalSignature(filePath).catch(() => ({
      status: "unavailable" as const,
      provider: "local-signature" as const,
      reason: "local_scan_failed",
    }));
  }

  let sample: Awaited<ReturnType<typeof makeScanSample>> | null = null;
  try {
    sample = await makeScanSample(filePath);
    const bytes = await readFile(sample.path);
    const form = new FormData();
    form.append("audio", new Blob([bytes], { type: "audio/wav" }), "sample.wav");

    const requestUrl = `${baseUrl}/v1/fingerprint/scan`;
    const identityHeaders = await cloudRunIdentityHeaders(baseUrl, requestUrl);
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        ...identityHeaders,
        "x-api-key": serviceKey,
      },
      body: form,
      signal: AbortSignal.timeout(timeoutMs()),
    });

    const payload = (await response.json().catch(() => ({}))) as GatewayResponse;
    if (!response.ok || payload.status === "unavailable") {
      return {
        status: "unavailable",
        provider: "acrcloud",
        reason: payload.code ?? `http_${response.status}`,
      };
    }
    if (payload.status === "match" && Array.isArray(payload.matches) && payload.matches.length) {
      return { status: "match", provider: "acrcloud", matches: payload.matches };
    }
    if (payload.status === "no_match") {
      return { status: "no_match", provider: "acrcloud", scope: "global_commercial", matches: [] };
    }
    return { status: "unavailable", provider: "acrcloud", reason: "invalid_response" };
  } catch (error) {
    const reason =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
        ? "timeout"
        : "request_failed";
    return { status: "unavailable", provider: "acrcloud", reason };
  } finally {
    await sample?.cleanup();
  }
}