---
name: Studio library Firestore linkage
description: How song_drafts/audio_jobs in Firestore link to the app, and why certification must key by project id
---

# Firestore studio library (song_drafts + audio_jobs)

Firestore is a **secondary** tracker only. Source of truth for entitlement stays
PostgreSQL `users` + Stripe via the `gk_session` cookie. The studio "library"
(`GET /api/library/studio`) queries Firestore `song_drafts` + `audio_jobs` by
`sessionId == gk_session`.

## Rule: key song_drafts by the PostgreSQL project id, not a random draftId
The lyrics flow is three steps with two different keys:
generate (no project yet) → save project (`POST /lyrics/project`, mints PG id) →
revise (`POST /lyrics/revise`, keyed by projectId).

**Why:** an earlier version wrote the draft at *generate* time with a random
`draftId`, then `revise` called `updateSongDraft(projectId)`. The ids never
matched, so `is_certified`/score updates targeted a non-existent doc and the
library always showed drafts as uncertified.

**How to apply:** create the canonical `song_drafts` doc at save-project time with
the doc id == PG project id (`saveSongDraft(data, projectId)`), and have revise
`updateSongDraft(projectId, …)` upsert the same doc. Both `saveSongDraft` and
`updateSongDraft` use Firestore `.set(…, { merge: true })` so order/missing-doc
never throws. Do **not** also write a draft at generate time — it produces an
orphan duplicate, and free users have no `gk_session` so it isn't queryable anyway.

## Rule: paid features that mint artifacts must be verified server-side
The IP certificate is gated by `hasStudio(req)` + a server-side 25%
authorship-threshold check in `GET /lyrics/certificate/:projectId`. The client
fetches that endpoint before rendering the printable cert.
**Why:** paid-feature boundaries are security boundaries (threat_model.md); a
UI-only `isPro && isEligible` gate can be bypassed by faking client state.
**Note:** pre-existing Pro lyric endpoints (`/lyrics/regenerate-line`, `/revise`,
`/expand`) are still UI-gated only — flagged but intentionally not changed to
avoid locking out existing sessions mid-flow.
