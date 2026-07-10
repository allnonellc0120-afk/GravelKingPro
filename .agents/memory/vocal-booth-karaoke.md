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
   `lyricSource="auto"`) — backend is **Vertex AI Gemini** (`transcribeWithGemini`);
   the Vocal Booth UI now labels it honestly as "Gemini AI transcription". No Replicate
   fallback; if Gemini is unavailable it degrades to manual tap-to-time.
3. **Energy-based** RMS onset distribution (`analyzeGuideTiming`, `timingSource="energy"`)
   — approximate, no transcription; must stay labeled "energy-based"/"approximate".

Manual timing is **Tap-to-Time** (`startTapTiming`/`handleTapTime`, the "▶ Now"
button). It has BOTH a click button and a **spacebar** binding: a `useEffect` gated on
`tapTimingActive` listens for Space and calls `handleTapTime` (ignores INPUT/TEXTAREA/
contentEditable, preventDefaults scroll). Separately, an Escape keydown exits fullscreen.
**Why:** the honesty ethos forbids over-claiming on the energy path; the transcription
engine is Gemini (do not "swap in Gemini" — it already is), and the label must reflect that.
**How to apply:** keep approximate labeling on the energy path; keep the transcription
label as Gemini; the spacebar-tap shortcut already exists — reuse it, don't re-add.
