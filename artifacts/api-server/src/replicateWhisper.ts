/**
 * Replicate Whisper transcription provider.
 *
 * Uses vaibhavs10/incredibly-fast-whisper (word-level timestamps) with a
 * fallback to openai/whisper. Returns segments with start/end seconds so
 * the vocal booth can drive precise lyric highlighting.
 *
 * Never crashes the caller: all errors propagate as thrown exceptions.
 */

import { readFile } from "fs/promises";
import { uploadFile, runModel, isConfigured } from "./replicateClient";

export { isConfigured };

export interface WhisperSegment {
  text: string;
  start: number;
  end: number;
}

export interface WhisperResult {
  segments: WhisperSegment[];
  fullText: string;
}

function parseSegments(raw: unknown): WhisperSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: WhisperSegment[] = [];
  for (const seg of raw) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as Record<string, unknown>;
    const text = String(s["text"] ?? "").trim();
    const start = Number(s["start"] ?? 0);
    const end = Number(s["end"] ?? start + 0.5);
    if (text) out.push({ text, start, end });
  }
  return out;
}

function parseSRT(srt: string): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  for (const block of srt.split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const timeLine = lines[1] ?? "";
    const m = timeLine.match(
      /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/,
    );
    if (!m) continue;
    const start =
      parseInt(m[1]!) * 3600 + parseInt(m[2]!) * 60 + parseInt(m[3]!) + parseInt(m[4]!) / 1000;
    const end =
      parseInt(m[5]!) * 3600 + parseInt(m[6]!) * 60 + parseInt(m[7]!) + parseInt(m[8]!) / 1000;
    const text = lines.slice(2).join(" ").trim();
    if (text) segments.push({ text, start, end });
  }
  return segments;
}

function parseOutput(output: unknown): WhisperResult {
  if (!output) throw new Error("Whisper returned empty output");

  // incredibly-fast-whisper: { segments: [...], text: "..." }
  if (typeof output === "object" && !Array.isArray(output)) {
    const o = output as Record<string, unknown>;
    const segments = parseSegments(o["segments"]);
    const fullText = String(o["text"] ?? segments.map((s) => s.text).join(" ")).trim();
    if (segments.length > 0) return { segments, fullText };

    // openai/whisper fallback: { transcription: "<srt>", ... }
    if (typeof o["transcription"] === "string") {
      const segs = parseSRT(o["transcription"]);
      return { segments: segs, fullText: segs.map((s) => s.text).join(" ") };
    }
  }

  // Raw SRT string
  if (typeof output === "string") {
    const segs = parseSRT(output);
    return { segments: segs, fullText: segs.map((s) => s.text).join(" ") };
  }

  throw new Error(`Unrecognised Whisper output shape: ${JSON.stringify(output).slice(0, 200)}`);
}

/**
 * Transcribe an audio file via Replicate Whisper.
 * Tries incredibly-fast-whisper first (faster), falls back to openai/whisper.
 */
export async function transcribeAudio(filePath: string): Promise<WhisperResult> {
  const buf = await readFile(filePath);
  const audioUrl = await uploadFile(buf, "audio.wav", "audio/wav");

  try {
    const output = await runModel(
      "vaibhavs10",
      "incredibly-fast-whisper",
      {
        audio: audioUrl,
        task: "transcribe",
        language: "english",
        timestamp: "chunk",
        batch_size: 64,
        diarise_audio: false,
      },
      120_000,
    );
    return parseOutput(output);
  } catch {
    // Fallback to openai/whisper (slower but widely available)
    const output = await runModel(
      "openai",
      "whisper",
      {
        audio: audioUrl,
        model: "large-v3",
        language: "en",
        transcription: "srt",
      },
      180_000,
    );
    return parseOutput(output);
  }
}
