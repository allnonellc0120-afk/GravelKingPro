---
name: Replicate Demucs prediction-creation gotchas
description: Why the Replicate htdemucs separation silently fell back to DSP, and the invariants that keep the neural path primary
---

The neural separation path (ryan5453/demucs htdemucs, voice_remove + stem_split) kept
falling back to DSP for non-obvious reasons. Three durable lessons:

## 1. Never make two prediction-creation POSTs per attempt (burst-token trap)
**Rule:** Resolve the model version with a GET (`/models/{owner}/{name}`) — that does NOT
count against the prediction-creation rate limit — then POST once to the versioned
`/predictions` endpoint. Do NOT POST to the deployment endpoint
(`/models/{owner}/{name}/predictions`) for a model that has a released version.
**Why:** The deployment endpoint 404s for a versioned-but-not-deployed model, but the 404
still CONSUMES a prediction-creation rate token. Under a low-credit Replicate account the
throttle is "6 req/min, burst 1", so that throwaway 404 ate the only allowed token and the
real versioned POST immediately after always 429'd → DSP fallback every time. Isolated
direct calls "worked" only because they made a single POST.
**How to apply:** Only route to the deployment endpoint when the model genuinely has no
released version. Distinguish that case with a dedicated error type (e.g.
`NoReleasedVersionError`) — a transient network/auth/timeout error from version-resolve must
NOT silently retry on the deployment endpoint (that reintroduces the 404+burst bug); it must
propagate so the route falls back to DSP. Version hash is cacheable (it rarely changes).

## 2. The two-stem param is `stem`, not `two_stems`
**Rule:** For ryan5453/demucs, `stem: "vocals"` puts it in two-stem mode → returns `vocals`
+ `no_vocals` (the instrumental). Omit `stem` entirely for the full 4-stem split
(bass/drums/other/vocals).
**Why:** `two_stems` does NOT exist on this model — it's silently ignored, so the model
defaults to a 4-stem split that has no `no_vocals`/instrumental key, and voice_remove then
threw "No instrumental stem" → DSP fallback.

## 3. Bound EVERY Replicate fetch, not just polling
**Rule:** Wrap upload, version GET, prediction-create POST, poll GET, and stem download each
in an AbortController deadline. Polling already had an overall loop deadline; the others did
not.
**Why:** A stalled TCP connection on upload/create/download would hang the request and hold a
concurrency slot indefinitely instead of timing out → can't fall back to DSP, and during a
deploy SIGTERM this surfaces as the "Processing failed" UI crash. The per-fetch bound throws
a clear timeout error so the route's catch runs DSP.
