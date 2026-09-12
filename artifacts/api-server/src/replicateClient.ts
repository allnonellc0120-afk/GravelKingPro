/**
 * Shared Replicate API HTTP client.
 * Handles file upload, prediction creation (new-style model endpoint),
 * and polling. No local torch/Python — pure HTTPS.
 */

import Replicate from "replicate";

const REPLICATE_BASE = "https://api.replicate.com/v1";
export const DEFAULT_RVC_MODEL =
  "zsxkib/realistic-voice-cloning:0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550";

function getToken(): string | undefined {
  return process.env["REPLICATE_API_TOKEN"];
}

let sdkClient: Replicate | null = null;

/**
 * Lazily initialize the official Replicate SDK. Keeping this lazy preserves
 * the existing no-token behavior: routes can still report "not configured"
 * and fall back locally instead of crashing during API-server startup.
 */
export function getReplicateClient(): Replicate {
  const token = getToken();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  if (!sdkClient) {
    sdkClient = new Replicate({ auth: token });
  }
  return sdkClient;
}

export function isConfigured(): boolean {
  return Boolean(getToken());
}

export interface VoiceConvertInput {
  /** URL of the clean vocal stem to convert. */
  audioUrl: string;
  /** Optional URL for a custom RVC .pth/.zip model weights file. */
  modelWeightsUrl?: string;
  /** Pitch shift in semitones. Defaults to 0. */
  pitchShift?: number;
  /** RVC index mix rate. Defaults to 0.8. */
  indexRate?: number;
  /** RVC median-filter radius for F0 estimation. */
  filterRadius?: number;
  /** RVC protection amount for consonants/clean source detail. */
  protect?: number;
}

export interface VoiceConvertResult {
  outputUrl: string;
  predictionId: string;
}

function requireHttpUrl(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Replicate RVC ${field} must be a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Replicate RVC ${field} must use http or https`);
  }
  return parsed.toString();
}

function outputUrl(output: unknown): string {
  if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
  if (output instanceof URL) return output.toString();
  if (Array.isArray(output)) {
    for (const item of output) {
      try {
        return outputUrl(item);
      } catch {
        // Try the next output when a model returns multiple files.
      }
    }
  }
  if (output && typeof output === "object") {
    const candidate = output as { url?: unknown; href?: unknown };
    if (typeof candidate.url === "function") {
      const url = candidate.url();
      if (typeof url === "string" && /^https?:\/\//.test(url)) return url;
      if (url instanceof URL) return url.toString();
    }
    if (typeof candidate.url === "string" && /^https?:\/\//.test(candidate.url)) return candidate.url;
    if (candidate.url instanceof URL) return candidate.url.toString();
    if (typeof candidate.href === "string" && /^https?:\/\//.test(candidate.href)) return candidate.href;
    if (candidate.href instanceof URL) return candidate.href.toString();
  }
  throw new Error("Replicate RVC returned no audio URL");
}

/**
 * Run custom RVC voice conversion through the configured Replicate model.
 *
 * GravelKing voice conversion is pinned to the validated release. Do not allow
 * a stale environment override to silently send production traffic to the
 * unversioned endpoint. The deployment requires rvc_model=CUSTOM when custom
 * weights are supplied.
 */
export async function convertToGravelKingVoice(input: VoiceConvertInput): Promise<VoiceConvertResult> {
  const model = DEFAULT_RVC_MODEL;
  if (!/^[^/\s]+\/[^/:\s]+(?::[^:\s]+)?$/.test(model)) {
    throw new Error("REPLICATE_RVC_MODEL must use owner/model or owner/model:version format");
  }
  const modelRef = model as `${string}/${string}` | `${string}/${string}:${string}`;
  if (!input || typeof input.audioUrl !== "string") {
    throw new Error("Replicate RVC audioUrl is required");
  }

  const audio = requireHttpUrl(input.audioUrl, "audioUrl");
  const modelWeights = input.modelWeightsUrl
    ? requireHttpUrl(input.modelWeightsUrl, "modelWeightsUrl")
    : undefined;
  const pitchShift = input.pitchShift ?? 0;
  const indexRate = input.indexRate ?? 0.78;
  const protect = input.protect ?? 0.10;
  const filterRadius = input.filterRadius ?? 3;

  if (!Number.isFinite(pitchShift) || pitchShift < -24 || pitchShift > 24) {
    throw new Error("Replicate RVC pitchShift must be between -24 and 24 semitones");
  }
  if (!Number.isFinite(indexRate) || indexRate < 0 || indexRate > 1) {
    throw new Error("Replicate RVC indexRate must be between 0 and 1");
  }
  if (!Number.isFinite(protect) || protect < 0 || protect > 1) {
    throw new Error("Replicate RVC protect must be between 0 and 1");
  }
  if (!Number.isInteger(filterRadius) || filterRadius < 0 || filterRadius > 7) {
    throw new Error("Replicate RVC filterRadius must be an integer between 0 and 7");
  }

  const modelInput: Record<string, string | number> = {
    rvc_model: "CUSTOM",
    song_input: audio,
    custom_rvc_model_download_url: modelWeights ?? "",
    pitch_detection_algorithm: "rmvpe",
    pitch_change: pitchShift === 0
      ? "no-change"
      : pitchShift > 0
        ? `+${pitchShift}`
        : `${pitchShift}`,
    index_rate: indexRate,
    filter_radius: filterRadius,
    rms_mix_rate: 0.25,
    protect,
  };

  const [, version] = model.split(":");
  if (!version) throw new Error("Pinned Replicate RVC model version is required");
  const predictionId = await postPredictionWithRetry(() =>
    replicateFetch("/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, input: modelInput }),
    }),
  );
  const output = await pollPrediction(predictionId, 180_000);
  return { outputUrl: outputUrl(output), predictionId };
}

// Default per-request network timeout. Every Replicate HTTP call is bounded by
// an AbortController so a stalled connection (upload, version GET, prediction
// create, poll GET) can never hang the route + hold a concurrency slot — it
// throws, the caller catches, and we fall back to DSP. The overall poll loop
// has its own (longer) deadline on top of this per-request bound.
const REPLICATE_FETCH_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 90_000; // large multipart uploads need more headroom

/**
 * fetch() with a hard AbortController deadline. On timeout it throws a clear
 * error (not a silent hang) so callers fall back to DSP.
 */
async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Replicate request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function replicateFetch(
  path: string,
  opts: RequestInit = {},
  timeoutMs = REPLICATE_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
    ...(opts.headers as Record<string, string> ?? {}),
  };
  return fetchWithTimeout(`${REPLICATE_BASE}${path}`, { ...opts, headers }, timeoutMs);
}

/**
 * Upload a buffer to the Replicate Files API.
 * Returns the file URL to pass as a model input.
 */
export async function uploadFile(
  buf: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const token = getToken();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");

  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(buf)], { type: mimeType }), filename);

  const res = await fetchWithTimeout(
    `${REPLICATE_BASE}/files`,
    {
      method: "POST",
      headers: { Authorization: `Token ${token}` },
      body: form,
    },
    UPLOAD_TIMEOUT_MS,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Replicate file upload failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    urls?: { get?: string };
    url?: string;
    id?: string;
  };

  const url = data.urls?.get ?? data.url;
  if (!url) throw new Error("Replicate file upload: no URL in response");
  return url;
}

// Low-credit Replicate accounts get prediction creation throttled to a tiny
// burst (6/min, burst 1) with a ~10s reset window. The throttle is transient:
// a single isolated request succeeds. So on 429 we wait out the window
// (respecting the server's retry_after) and retry instead of giving up — only
// falling back to DSP if the throttle won't clear after several attempts.
const MAX_429_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 15_000;
const DEFAULT_RETRY_WAIT_MS = 6_000;

// Cache the resolved latest version hash per model so we don't re-fetch the
// model document on every request (the demucs model has no active deployment,
// so every call would otherwise pay an extra round-trip).
const versionCache = new Map<string, string>();

function parseRetryAfterMs(res: Response, body: string): number {
  const hdr = res.headers.get("retry-after");
  if (hdr) {
    const secs = Number(hdr);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.min(secs * 1000, MAX_RETRY_WAIT_MS);
    }
  }
  try {
    const j = JSON.parse(body) as { retry_after?: number };
    if (typeof j.retry_after === "number" && j.retry_after > 0) {
      return Math.min(j.retry_after * 1000, MAX_RETRY_WAIT_MS);
    }
  } catch {
    /* body wasn't JSON — use default */
  }
  return DEFAULT_RETRY_WAIT_MS;
}

/**
 * Thrown ONLY when a model genuinely has no released version (a deployment-only
 * model). Distinct from network/auth/not-found errors so `createPrediction` can
 * route to the deployment endpoint exclusively in that case — never on a
 * transient failure (which would reintroduce the 404+burst-token bug).
 */
class NoReleasedVersionError extends Error {}

async function resolveLatestVersion(owner: string, name: string): Promise<string> {
  const key = `${owner}/${name}`;
  const cached = versionCache.get(key);
  if (cached) return cached;

  const modelRes = await replicateFetch(`/models/${owner}/${name}`);
  if (!modelRes.ok) {
    const body = await modelRes.text().catch(() => "");
    throw new Error(`Replicate model ${owner}/${name} not found (${modelRes.status}): ${body}`);
  }
  const modelData = (await modelRes.json()) as { latest_version?: { id?: string } };
  const version = modelData.latest_version?.id;
  if (!version) {
    throw new NoReleasedVersionError(`Replicate model ${owner}/${name} has no released version`);
  }
  versionCache.set(key, version);
  return version;
}

/**
 * POST a prediction-creation request (produced by `makeRequest`) and return the
 * prediction ID, retrying on a 429 throttle (waiting out the reset window).
 * `makeRequest` is a thunk so each retry issues a fresh request.
 */
async function postPredictionWithRetry(
  makeRequest: () => Promise<Response>,
): Promise<string> {
  let lastBody = "";

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await makeRequest();

    if (res.status === 429) {
      lastBody = await res.text().catch(() => "");
      if (attempt < MAX_429_RETRIES) {
        const waitMs = parseRetryAfterMs(res, lastBody) + 1_000;
        await new Promise<void>((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(
        `Replicate createPrediction throttled (429) after ${attempt + 1} attempts: ${lastBody}`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Replicate createPrediction failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { id?: string; error?: string };
    if (data.error) throw new Error(`Replicate prediction error: ${data.error}`);
    if (!data.id) throw new Error("Replicate createPrediction: no id in response");
    return data.id;
  }

  throw new Error(`Replicate createPrediction throttled (429): ${lastBody}`);
}

/**
 * Create a prediction and return its ID, retrying on a 429 throttle.
 *
 * IMPORTANT: we resolve the model's latest version with a GET (which does NOT
 * count against the prediction-creation rate limit) and POST directly to the
 * versioned `/predictions` endpoint. We deliberately do NOT hit the deployment
 * endpoint (`/models/{owner}/{name}/predictions`): for a model with no active
 * deployment it returns 404 *after* consuming a prediction-creation rate token.
 * Under the low-credit burst-1 throttle that throwaway 404 ate the only allowed
 * token, so the real versioned POST that followed always hit a 429 and forced a
 * premature DSP fallback. One prediction-creation POST per attempt = no
 * self-inflicted throttle.
 *
 * If the model has no released version (a deployment-only model), we fall back
 * to the deployment endpoint.
 */
export async function createPrediction(
  owner: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  let version: string;
  try {
    version = await resolveLatestVersion(owner, name);
  } catch (err) {
    if (!(err instanceof NoReleasedVersionError)) {
      // Transient failure (network/auth/not-found/timeout). Do NOT hit the
      // deployment endpoint — for a versioned model that 404s and burns the
      // burst token. Propagate so the route falls back to DSP.
      throw err;
    }
    // Genuinely deployment-only model. Use the deployment endpoint directly
    // (with retry); there's no throwaway 404 in this path.
    return postPredictionWithRetry(() =>
      replicateFetch(`/models/${owner}/${name}/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      }),
    );
  }

  return postPredictionWithRetry(() =>
    replicateFetch(`/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, input }),
    }),
  );
}

/**
 * Poll a prediction until it succeeds, fails, or times out.
 * Returns the output on success.
 */
export async function pollPrediction(
  id: string,
  timeoutMs = 180_000,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let delayMs = 2_000;

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`Replicate prediction ${id} timed out after ${timeoutMs}ms`);
    }

    const res = await replicateFetch(`/predictions/${id}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Replicate poll failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      status: string;
      output?: unknown;
      error?: string;
    };

    if (data.status === "succeeded") return data.output;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Replicate prediction ${data.status}: ${data.error ?? "unknown error"}`);
    }

    await new Promise<void>((r) => setTimeout(r, delayMs));
    delayMs = Math.min(delayMs * 1.5, 10_000);
  }
}

/**
 * Full round-trip: create prediction, poll, return output.
 */
export async function runModel(
  owner: string,
  name: string,
  input: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<unknown> {
  const id = await createPrediction(owner, name, input);
  return pollPrediction(id, timeoutMs);
}
