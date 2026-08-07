/**
 * GravelKing Productions — Gemini vocal transcription (Google Cloud only).
 *
 * Runs exclusively on the owner's own Google Cloud Vertex AI via
 * GCP_SERVICE_ACCOUNT. The Replit AI Integrations Gemini proxy fallback was
 * removed because it is Replit-billed and returns "401 ApiKey not approved" in
 * production. If Vertex fails, the route degrades to manual tap-to-time rather
 * than silently routing the owner's audio through Replit's managed AI.
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
  VERTEX_MODEL,
} from "./geminiVertex";
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
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
  return postGenerateContent("Vertex AI Gemini", url, { Authorization: `Bearer ${token}` }, buildRequestBody(data, mimeType));
}

/**
 * Transcribe vocals from an audio file using Gemini.
 *
 * Google Cloud Vertex AI ONLY (owner's own GCP billing via GCP_SERVICE_ACCOUNT).
 * The Replit AI Integrations proxy fallback was removed: it 401s in production
 * ("ApiKey not approved") and made karaoke transcription depend on Replit
 * billing. If Vertex fails, the caller degrades to manual tap-to-time.
 */
export async function transcribeWithGemini(
  filePath: string,
): Promise<{ segments: TranscriptSegment[]; fullText: string }> {
  const { data, mimeType } = await compressForGemini(filePath);

  if (!isVertexConfigured()) {
    throw new Error(
      "Google Cloud Gemini is not configured — GCP_SERVICE_ACCOUNT must hold a valid service-account JSON key.",
    );
  }

  let rawText = "";
  try {
    rawText = await transcribeViaVertex(data, mimeType);
  } catch (err) {
    logger.warn({ err }, "Vertex AI transcription failed");
    throw err instanceof Error ? err : new Error(String(err));
  }

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
