/**
 * Shared Replicate API HTTP client.
 * Handles file upload, prediction creation (new-style model endpoint),
 * and polling. No local torch/Python — pure HTTPS.
 */

const REPLICATE_BASE = "https://api.replicate.com/v1";

function getToken(): string | undefined {
  return process.env["REPLICATE_API_TOKEN"];
}

export function isConfigured(): boolean {
  return Boolean(getToken());
}

async function replicateFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
    ...(opts.headers as Record<string, string> ?? {}),
  };
  return fetch(`${REPLICATE_BASE}${path}`, { ...opts, headers });
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

  const res = await fetch(`${REPLICATE_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Token ${token}` },
    body: form,
  });

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

/**
 * Create a prediction via the new-style model endpoint
 * (no version hash required — uses the latest deployment).
 * Returns the prediction ID.
 */
export async function createPrediction(
  owner: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await replicateFetch(`/models/${owner}/${name}/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Replicate createPrediction failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id?: string; error?: string };
  if (data.error) throw new Error(`Replicate prediction error: ${data.error}`);
  if (!data.id) throw new Error("Replicate createPrediction: no id in response");
  return data.id;
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
