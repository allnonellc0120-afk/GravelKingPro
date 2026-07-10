---
name: Gemini provider config
description: How GravelKingPro's Gemini features (lyrics/songwriter, transcription, Firestore) are wired to Google Cloud vs the Replit AI proxy, and why they silently degrade.
---

# Gemini provider configuration

The product is *meant* to run its Gemini features on the user's OWN Google Cloud
via the `GCP_SERVICE_ACCOUNT` secret (a service-account JSON key). That one secret
powers three things: lyrics/songwriter text generation (Vertex AI), vocal
transcription (Vertex AI, `/api/audio/transcribe`), and Firestore (studio library).

**Gotcha — the credential is a placeholder, not a real key.** In BOTH dev and prod,
`GCP_SERVICE_ACCOUNT` holds a short non-JSON token, so `JSON.parse` fails and
`isVertexConfigured()` returns false. Consequences seen in production:
- transcription 502s → client falls back to manual tap-to-time
- Firestore `getDb()` silently returns null
- lyrics generation falls back to the Replit AI proxy

**The Replit AI Integrations Gemini proxy is flaky in production.** It intermittently
returns `401 "ApiKey not approved"` (Apigee `oauth.v2.ApiKeyNotApproved`) and
sometimes recovers after a redeploy. Do NOT treat it as a reliable sole provider —
that flakiness was the original "lyrics broken in prod" report.

**Design (resilient provider selection).** `geminiGenerate()` in `routes/lyrics.ts`
prefers Vertex when `isVertexConfigured()`, and falls back to the proxy on error OR
empty output; if Vertex isn't configured it goes straight to the proxy. Vertex auth
+ token cache + `generateVertexContent/Text` live in `geminiVertex.ts` and are shared
with `geminiTranscribe.ts`.

**Why:** keeps lyrics working today (placeholder credential → proxy) with zero
regression, while auto-routing to the user's Google Cloud the moment a real
service-account JSON is supplied — no code change needed.

**How to apply — when a real `GCP_SERVICE_ACCOUNT` is provided:** update it in dev
AND prod (redeploy for prod), then smoke-test `/api/lyrics/generate` and
`/api/audio/transcribe`. Verify the Vertex model (`VERTEX_MODEL`, currently
`gemini-2.0-flash`) is still served on Vertex — it may be retired by 2026; bump if
the call 404s. Note a model mismatch by design: Vertex path uses `gemini-2.0-flash`,
proxy fallback uses `gemini-3-flash-preview`, so lyric style differs between paths.
