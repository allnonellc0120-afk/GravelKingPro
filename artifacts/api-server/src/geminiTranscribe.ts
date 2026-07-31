/**
 * GravelKing Productions — Gemini vocal transcription (dual provider).
 *
 * Prefers the user's own Google Cloud Vertex AI (GCP_SERVICE_ACCOUNT) and
 * falls back to the Replit AI Integrations Gemini proxy when Vertex is
 * unconfigured or errors (e.g. the aiplatform API is disabled in the GCP
 * project, which returns 403). Only throws when every available provider
 * fails, so the route returns a real transcript instead of the 502
 * tap-to-time fallback whenever ANY provider works.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import {
  getGcpCredentials,
  getVertexAccessToken,
  isVertexConfigured,
  VERTEX_LOCATION,
} from "./geminiVertex";
import { isProxyConfigured } from "./geminiProxy";
import { logger } from "./lib/logger";

const execFileAsync = promisify(execFile);

/**
 * Compress audio to mono 16kHz 32kbps MP3 so it fits Vertex AI's 8 MB inline limit.
 * A 5-min song becomes ~1.2 MB; a 10-min song ~2.4 MB — well within limits.
 */
async function compressForGemini(inputPath: string): Promise<{ data: string; mimeType: string }> {
  const id      = randomUUID();
  const outPath = `/tmp/gkp_gemini_${id}.mp3`;
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath,
      "-ac", "1",      // mono
      "-ar", "16000",  // 16 kHz
      "-b:a", "32k",   // 32 kbps
      "-f", "mp3", outPath,
    ], { timeout: 120_000 });
    const buf = await readFile(outPath);
    if (buf.length > 7 * 1024 * 1024) {
      throw new Error("track_too_long: audio exceeds Vertex AI 8 MB inline limit even after compression");
    }
    return { data: buf.toString("base64"), mimeType: "audio/mp3" };
  } finally {
    await unlink(outPath).catch(() => {});
  }
}

export interface TranscriptSegment {
  text:  string;
  start: number;
  end:   number;
}

const TRANSCRIBE_PROMPT = [
  "You are a precise vocal transcription engine.",
  "Transcribe every sung or spoken lyric in this audio track.",
  "Return ONLY a valid JSON array — no markdown, no commentary.",
  "Each element: { \"text\": string, \"start\": number, \"end\": number }",
  "where start/end are seconds. Group into natural lyric lines.",
  "If there are no vocals, return [].",
].join(" ");

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

function buildRequestBody(data: string, mimeType: string): string {
  return JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data } },
        { text: TRANSCRIBE_PROMPT },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      temperature: 0.0,
    },
  });
}

/** POST a generateContent body and return the first candidate's text. */
async function postGenerateContent(
  providerName: string,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(90_000),
  });

  // Always read as text first — avoids res.json() crashing on chunked /
  // non-JSON error responses before our own catch can handle it.
  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`${providerName} ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  let result: GeminiResponse = {};
  try {
    result = JSON.parse(bodyText) as GeminiResponse;
  } catch {
    throw new Error(`${providerName} returned non-JSON: ${bodyText.slice(0, 200)}`);
  }
  return result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function transcribeViaVertex(data: string, mimeType: string): Promise<string> {
  const creds = getGcpCredentials();
  const token = await getVertexAccessToken();
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/gemini-2.0-flash:generateContent`;
  return postGenerateContent("Vertex AI Gemini", url, { Authorization: `Bearer ${token}` }, buildRequestBody(data, mimeType));
}

async function transcribeViaProxy(data: string, mimeType: string): Promise<string> {
  const baseUrl = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
  const apiKey  = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
  if (!baseUrl || !apiKey) {
    throw new Error("Replit Gemini proxy not configured (AI_INTEGRATIONS_GEMINI_* missing)");
  }
  const url = `${baseUrl}/models/gemini-2.5-flash:generateContent`;
  return postGenerateContent("Replit Gemini proxy", url, { "x-goog-api-key": apiKey }, buildRequestBody(data, mimeType));
}

/**
 * Transcribe vocals from an audio file using Gemini.
 * Tries Vertex AI first (user's own GCP billing), then the Replit AI proxy.
 * Returns timed lyric segments suitable for Smule-style karaoke display.
 */
export async function transcribeWithGemini(
  filePath: string,
): Promise<{ segments: TranscriptSegment[]; fullText: string }> {
  const { data, mimeType } = await compressForGemini(filePath);

  let rawText = "";
  let lastErr: unknown = new Error("No AI provider configured (set GCP_SERVICE_ACCOUNT or AI_INTEGRATIONS_GEMINI_*)");
  let succeeded = false;

  if (isVertexConfigured()) {
    try {
      rawText = await transcribeViaVertex(data, mimeType);
      succeeded = true;
    } catch (err) {
      lastErr = err;
      logger.warn({ err }, "Vertex AI transcription failed; trying Replit Gemini proxy");
    }
  }

  if (!succeeded && isProxyConfigured()) {
    try {
      rawText = await transcribeViaProxy(data, mimeType);
      succeeded = true;
    } catch (err) {
      lastErr = err;
      logger.warn({ err }, "Replit Gemini proxy transcription failed");
    }
  }

  if (!succeeded) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

  let segments: TranscriptSegment[] = [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      segments = parsed.filter(
        (s): s is TranscriptSegment =>
          typeof s?.text  === "string" &&
          typeof s?.start === "number" &&
          typeof s?.end   === "number",
      );
    }
  } catch {
    if (rawText.trim()) {
      segments = [{ text: rawText.trim(), start: 0, end: 0 }];
    }
  }

  const fullText = segments.map((s) => s.text).join("\n");
  return { segments, fullText };
}
