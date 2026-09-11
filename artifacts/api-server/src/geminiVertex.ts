/**
 * GravelKing Productions — Vertex AI (Gemini) shared client.
 *
 * Authenticates via GCP_SERVICE_ACCOUNT (the same service account used for
 * Firestore and audio transcription). Bills Google Cloud credits directly —
 * NOT the Replit AI Integrations proxy, which is a dev-only sidecar and is
 * rejected in production ("ApiKey not approved").
 *
 * Both text generation (lyrics/songwriter) and audio transcription share the
 * auth + token cache here so there is a single, proven code path to Google.
 */

import { GoogleAuth } from "google-auth-library";

interface GcpCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function getGcpCredentials(): GcpCredentials {
  const raw = process.env["GCP_SERVICE_ACCOUNT"];
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT not configured");
  return JSON.parse(raw) as GcpCredentials;
}

/**
 * True only when GCP_SERVICE_ACCOUNT holds a valid service-account JSON
 * credential (project_id + client_email + private_key). A missing secret or a
 * placeholder token returns false so callers can fall back to another provider
 * instead of throwing on JSON.parse.
 */
export function isVertexConfigured(): boolean {
  const raw = process.env["GCP_SERVICE_ACCOUNT"];
  if (!raw) return false;
  try {
    const c = JSON.parse(raw) as Partial<GcpCredentials>;
    return Boolean(c.project_id && c.client_email && c.private_key);
  } catch {
    return false;
  }
}

export const VERTEX_LOCATION = "us-central1";
// gemini-2.0-flash is retired on this project and 404s ("Publisher model ...
// was not found"). gemini-2.5-flash is the model Vertex actually serves here.
export const VERTEX_MODEL = "gemini-2.5-flash";

let _cachedToken: { token: string; expiry: number } | null = null;

export async function getVertexAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiry - 60_000) {
    return _cachedToken.token;
  }
  const creds = getGcpCredentials();
  const auth = new GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const resp = await client.getAccessToken();
  if (!resp.token) throw new Error("Failed to obtain Vertex AI access token from service account");
  const expiry =
    (resp.res?.data as { expiry_date?: number })?.expiry_date ?? Date.now() + 3_600_000;
  _cachedToken = { token: resp.token, expiry };
  return resp.token;
}

type VertexPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface GenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  responseMimeType?: string;
  tools?: Array<{ googleSearch?: Record<string, never> }>;
  /** gemini-2.5-* models think by default and thinking tokens count against
   * maxOutputTokens; pass { thinkingBudget: 0 } when a tight token cap must go
   * entirely to the answer. */
  thinkingConfig?: { thinkingBudget: number };
}

interface VertexResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Low-level Vertex AI generateContent call. Returns the first candidate's text.
 * Reads the response as text first so a chunked / non-JSON Vertex error body
 * never crashes res.json() before the caller's own error handling runs.
 */
export async function generateVertexContent(
  parts: VertexPart[],
  generationConfig: GenerationConfig = {},
  timeoutMs = 60_000,
): Promise<string> {
  const creds = getGcpCredentials();
  const token = await getVertexAccessToken();
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
  const { tools, ...vertexGenerationConfig } = generationConfig;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 8192, ...vertexGenerationConfig },
      ...(tools ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Vertex AI Gemini ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  let result: VertexResponse = {};
  try {
    result = JSON.parse(bodyText) as VertexResponse;
  } catch {
    throw new Error(`Vertex AI returned non-JSON: ${bodyText.slice(0, 200)}`);
  }
  return result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** Convenience helper for plain text-in / text-out prompts (lyrics, rhymes, etc). */
export async function generateVertexText(
  prompt: string,
  generationConfig: GenerationConfig = {},
): Promise<string> {
  return generateVertexContent([{ text: prompt }], generationConfig);
}

/**
 * Streams plain-text Gemini output as Vertex emits it. The callback receives
 * text deltas, while the resolved value contains the complete response.
 */
export async function generateVertexTextStream(
  prompt: string,
  generationConfig: GenerationConfig = {},
  onText: (text: string) => void,
  timeoutMs = 60_000,
): Promise<string> {
  const creds = getGcpCredentials();
  const token = await getVertexAccessToken();
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:streamGenerateContent?alt=sse`;
  const { tools, ...vertexGenerationConfig } = generationConfig;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, ...vertexGenerationConfig },
      ...(tools ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok || !response.body) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Vertex AI Gemini stream ${response.status}: ${bodyText.slice(0, 400)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completeText = "";

  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data) as VertexResponse;
    const text = chunk.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
    if (!text) return;
    completeText += text;
    onText(text);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer);
  return completeText;
}
