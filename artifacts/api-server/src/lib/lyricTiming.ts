import { randomUUID } from "node:crypto";

export type TimedLyricLine = {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
};

/**
 * Deterministic plain-lyrics fallback. Empty lines and section labels remain
 * out of the timed sequence; every lyric line gets a stable order and a
 * four-second bar unless an audio duration is available.
 */
export function parsePastedLyrics(text: string, durationMs = 0): TimedLyricLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/.test(line));
  if (lines.length === 0) return [];
  const barMs = durationMs > 0
    ? Math.max(1_500, Math.floor(durationMs / lines.length))
    : 4_000;
  return lines.map((line, index) => ({
    id: `pasted-${index + 1}`,
    text: line,
    startTimeMs: index * barMs,
    endTimeMs: (index + 1) * barMs,
  }));
}

export function transcriptToTimedLines(
  segments: Array<{ text: string; start: number; end: number }>,
): TimedLyricLine[] {
  return segments
    .filter((segment) => segment && typeof segment.text === "string" && segment.text.trim())
    .map((segment) => ({
      id: randomUUID(),
      text: segment.text.trim(),
      startTimeMs: Math.max(0, Math.round(segment.start * 1000)),
      endTimeMs: Math.max(
        Math.round(segment.start * 1000),
        Math.round(segment.end * 1000),
      ),
    }));
}