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

## Lyric timing is energy-based & APPROXIMATE — never claim alignment
Line timing is computed from short-time RMS energy of the guide vocal (voiced-region
detection), then lyric lines are distributed across onsets. There is NO transcription
or forced alignment. All UI copy must say "energy-based" / "approximate" and the
stem split is labeled as bleeding/approximate too.
**Why:** the project's honesty ethos forbids over-claiming AI accuracy.
**How to apply:** keep the approximate labeling on any new timing/sync UI; don't add
"synced lyrics"/"word-perfect"/"transcribed" language.
