/**
 * GravelKing Productions — Replit AI Integrations (Gemini) proxy client.
 *
 * FALLBACK text provider used when the user's own Google Cloud Vertex AI
 * credential (GCP_SERVICE_ACCOUNT) is missing or invalid. Authenticates via the
 * auto-provisioned AI_INTEGRATIONS_GEMINI_* env vars and bills Replit credits.
 *
 * The proxy can intermittently return 401 in production, so callers always
 * prefer Vertex when it is configured and only fall back here. This keeps
 * lyric generation working instead of hard-failing when Vertex is unavailable.
 */

const PROXY_MODEL = "gemini-2.5-flash";

interface ProxyResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

interface ProxyGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
}

/** True when the Replit Gemini proxy env vars are present. */
export function isProxyConfigured(): boolean {
  return Boolean(
    process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"] &&
      process.env["AI_INTEGRATIONS_GEMINI_API_KEY"],
  );
}

/**
 * Plain text-in / text-out generation via the Replit Gemini proxy. Reads the
 * response as text first so a non-JSON error body never crashes JSON parsing
 * before the caller's own error handling runs.
 */
export async function generateProxyText(
  prompt: string,
  generationConfig: ProxyGenerationConfig = {},
  timeoutMs = 60_000,
): Promise<string> {
  const baseUrl = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Replit Gemini proxy not configured (AI_INTEGRATIONS_GEMINI_* missing)",
    );
  }

  const res = await fetch(`${baseUrl}/models/${PROXY_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, ...generationConfig },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Replit Gemini proxy ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  let result: ProxyResponse = {};
  try {
    result = JSON.parse(bodyText) as ProxyResponse;
  } catch {
    throw new Error(`Replit Gemini proxy returned non-JSON: ${bodyText.slice(0, 200)}`);
  }
  return (
    result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  );
}
