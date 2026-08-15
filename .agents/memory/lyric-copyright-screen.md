---
name: Lyric copyright screening invariants
description: honesty labeling, enforcement points, and fail policy for the lyric verification gate
---

Rules:
- The lyric check is an **AI screening** for recognizable commercial lyrics (incl.
  phonetic/obfuscated disguises). All copy must call it "AI screening" — never a
  commercial copyright-database lookup or legal clearance.
- Enforcement is **server-side** at every entry point where user lyrics become
  product state: song generation, lyric-project save, and possession-stamp import.
  `/api/lyrics/verify` is only a UI preview; the guard result is cached so
  verify-then-save costs one screening.
- Flagged → hard 422 with `code: "lyrics_flagged"` + matched work named. Screening
  infrastructure outage → **fail open with a loud log** (user directive: an outage of
  the checker must not take songwriting down; Lyria's own filter is the backstop).
- Library playback uses `/api/tracks/:id/stream` (owner-gated, inline, prefers MP3)
  and NEVER consumes the rolling export quota; `/download` is the only quota consumer.

**Why:** honest labeling was an explicit user requirement of the Task-94 overhaul;
client-only gating is trivially bypassable; quota-burning playback double-charged
users for listening to their own tracks.

**How to apply:** any new route that accepts user lyrics must call `verifyLyrics()`
before persisting; any new in-app playback surface must use /stream, not /download.
