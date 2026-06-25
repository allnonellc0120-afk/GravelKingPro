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

## Rule: every Gemini-backed lyric endpoint must be protected server-side
Paid-feature and cost boundaries are security boundaries (threat_model.md): a
UI-only `isPro` / quota gate is client-bypassable and exposes Gemini spend.
- **Pro-only AI editor endpoints** (`/lyrics/regenerate-line`, `/lyrics/rhymes`,
  `/lyrics/expand`) go through a `requireStudio` middleware (`hasStudio(req)` →
  403). The IP certificate (`GET /lyrics/certificate/:projectId`) also checks
  `hasStudio` **plus** the server-side 25% authorship threshold before issuing.
- **Anonymous-reachable AI endpoints** (`/lyrics/generate`, `/lyrics/convert-style`)
  can't be Pro-gated (free tier uses them), so they get the shared `rateLimit`
  middleware instead — same defense the audio/master/studio-mix routes use.
**Why:** the in-app "2 free generations" counter is React state only; the server
had zero quota, so direct API calls = unbounded Gemini cost.
**How to apply:** any *new* lyric/AI endpoint that calls Gemini must get either
`requireStudio` (if paid) or `rateLimit` (if free) — never ship one bare.

## Rule: by-id lyric routes use best-effort gk_session ownership, not strict
The by-id routes (`/lyrics/revise`, `/lyrics/forensic-entry`, `/lyrics/timeline-blocks`,
`GET /lyrics/project/:id`, `GET /lyrics/certificate/:projectId`) call
`ownershipMismatch(req, project.sessionId)` — block **only** when the caller
presents a *different* `gk_session` than the project owner's.
**Why:** ownership can't be made strict here. OIDC-authenticated users never get a
`gk_session` cookie, and `POST /lyrics/project` stores `sessionId = cookie ??
randomUUID()` (the random fallback is never returned to the client). Strict
"cookie must equal owner" would 403 OIDC/cookieless users on their *own* work.
**Residual gap (known, deferred):** a caller sending no cookie at all is not
blocked. Fully closing the IDOR needs an owner `userId` column on
`lyric_projects` + an anon session token returned at create — a schema/session
change, deliberately NOT done reactively (risk to the gk_session/Stripe flow).
