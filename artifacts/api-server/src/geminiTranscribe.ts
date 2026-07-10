/**
 * GravelKing Productions — Gemini Vertex AI Transcription
 * Authenticates via GCP_SERVICE_ACCOUNT (same service account used for Firestore).
 * Bills Google Cloud credits, not Replit proxy.
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

const execFileAsync = promisify(execFile);

export function isGeminiConfigured(): boolean {
  return isVertexConfigured();
}

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

/**
 * Transcribe vocals from an audio file using Vertex AI Gemini.
 * Returns timed lyric segments suitable for Smule-style karaoke display.
 */
export async function transcribeWithGemini(
  filePath: string,
): Promise<{ segments: TranscriptSegment[]; fullText: string }> {
  const creds    = getGcpCredentials();
  const token    = await getVertexAccessToken();
  const { data, mimeType } = await compressForGemini(filePath);

  const project  = creds.project_id;
  const location = VERTEX_LOCATION;
  const model    = "gemini-2.0-flash";

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data } },
        {
          text: [
            "You are a precise vocal transcription engine.",
            "Transcribe every sung or spoken lyric in this audio track.",
            "Return ONLY a valid JSON array — no markdown, no commentary.",
            "Each element: { \"text\": string, \"start\": number, \"end\": number }",
            "where start/end are seconds. Group into natural lyric lines.",
            "If there are no vocals, return [].",
          ].join(" "),
        },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      temperature: 0.0,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  // Always read as text first — avoids res.json() crashing on chunked /
  // non-JSON Vertex AI error responses before our own catch can handle it.
  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`Vertex AI Gemini ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  type VertexResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  let result: VertexResponse = {};
  try {
    result = JSON.parse(bodyText) as VertexResponse;
  } catch {
    throw new Error(`Vertex AI returned non-JSON: ${bodyText.slice(0, 200)}`);
  }
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

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
