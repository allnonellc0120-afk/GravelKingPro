---
name: Vocal Booth karaoke invariants
description: Honesty + mixdown invariants for the Pro-only Vocal Booth (split-your-own-song, guide vocal, lyric timing)
---

# Vocal Booth karaoke (gravelkingpro web)

The Pro-only Vocal Booth can split an uploaded song (server `stem_split` source=studio)
into an instrumental (→ backing track) plus an approximate vocal stem (→ optional
"guide vocal"), and can highlight the active lyric line in the teleprompter.

## Mixdown invariant — guide vocal NEVER reaches the export
The exported mix (`/api/kernel/studio-mix`) must contain ONLY the instrumental
backing track + the user's freshly recorded vocal. The extracted guide vocal is a
practice aid; it must never be appended to the mixdown form data.
**Why:** the guide vocal is a derivative of the user's *uploaded* song (and the
split is lossy/approximate) — baking it into an "export" would misrepresent it as
the user's own clean recording and muddy the IP story. It is a deliberate product +
honesty boundary, not just an implementation detail.
**How to apply:** when touching the mixdown path, verify the guide blob/url/ref is
absent from the export FormData. Only backingFile + recorder.vocalBlob go in.

## Lyric timing — three sources; label each honestly
Timing can come from three places, most to least accurate:
1. **lrclib.net synced LRC** (`searchLyrics`/`parseLrc`, `timingSource="lrc"`) —
   ms-accurate; label "Precise synced timing".
2. **AI transcription** via `POST /api/audio/transcribe` (`transcribeVocals`,
   `lyricSource="auto"`) — backend is **Vertex AI Gemini** (`transcribeWithGemini`),
   even though the Vocal Booth UI still labels it "Whisper". No Replicate fallback; if
   Gemini is unavailable it degrades to manual tap-to-time.
3. **Energy-based** RMS onset distribution (`analyzeGuideTiming`, `timingSource="energy"`)
   — approximate, no transcription; must stay labeled "energy-based"/"approximate".

Manual timing is **Tap-to-Time** (`startTapTiming`/`handleTapTime`, the "▶ Now"
button) — a click button, NOT a spacebar binding (the only keydown handler is
Escape-to-exit fullscreen).
**Why:** the honesty ethos forbids over-claiming on the energy path; and the "Whisper"
label is misleading — future work must not try to "swap in Gemini" (it already is
Gemini) nor claim a spacebar shortcut that doesn't exist.
**How to apply:** keep approximate labeling on the energy path; the transcription
engine is Gemini; add a real spacebar binding only if the user explicitly asks.
