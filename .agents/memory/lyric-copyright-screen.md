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
- Flagged → hard block with the matched work named. Screening infrastructure
  outage → **fail open with a loud log** (user directive: an outage of the checker
  must not take songwriting down; Lyria's own filter is the backstop) — but the
  result must be labeled unavailable/unscreened, NEVER presented as "cleared",
  and the owner must be able to delete the affected project.
- The screening model's reply is parsed **schema-strict**: only the exact
  contract shapes count; any partial/nonconforming response = unavailable
  (fail-open), never a clearance, and is never cached.
- In-app playback never consumes the rolling export quota; only explicit
  downloads/exports do.

**Why:** honest labeling and fail-open-with-honest-status are explicit user
requirements; client-only gating is trivially bypassable; treating a malformed
model reply as "clear" would silently fake a clearance; quota-burning playback
double-charged users for listening to their own tracks.

**How to apply:** any new surface that accepts user lyrics must run the server
screen before persisting; any new screening result presented to users must be
one of clear / flagged / unavailable — no silent defaults.
