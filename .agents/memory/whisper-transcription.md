---
name: Whisper transcription via Replicate
description: replicateWhisper.ts + /api/audio/transcribe pattern for vocal booth timed lyric detection
---

## Module
`artifacts/api-server/src/replicateWhisper.ts` — exports `transcribeAudio(filePath)` returning `{ segments: [{text, start, end}], fullText }`.

**Primary model:** `vaibhavs10/incredibly-fast-whisper` (120 s timeout, returns `{segments, text}`).
**Fallback model:** `openai/whisper` (180 s timeout, returns SRT string or `{transcription: "<srt>"}`).

Both paths converge through `parseOutput()` which handles all three output shapes (segment array, SRT string, `{transcription}` key).

## Route
`POST /api/audio/transcribe` in `audio.ts` — rate-limited, not concurrency-limited (runs on Replicate's infra). Returns 503 if `REPLICATE_API_TOKEN` is absent.

## Vocal Booth UI
- "Transcribe Vocals" button appears when `backingFile` is set (visible even before guide vocal is split).
- Groups Whisper segments into lyric lines: new line on gap > 1 s OR line > 55 chars.
- Sets `lyrics`, `timedLines` (lrc-quality timestamps), `timingSource = "lrc"`, `lyricSource = "whisper"`.
- Label shown to user: "Precise timing auto-detected via Whisper."

## Tap-to-time
Manual fallback for instrumentals: while backing plays, user taps "▶ Now" to stamp each lyric line.
State: `tapTimingActive`, `tapTimes: number[]`. Derived: `tapTimingLineIdx = tapTimes.length`.
Ignores section markers `[...]` in timable-lines calculation.
