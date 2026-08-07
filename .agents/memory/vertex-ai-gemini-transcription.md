---
name: Gemini transcription provider
description: Vocal transcription runs on Vertex AI only (Replit proxy fallback removed); shares VERTEX_MODEL with lyrics.
---

`POST /api/audio/transcribe` uses **Vertex AI Gemini only**, authenticated with
`GCP_SERVICE_ACCOUNT`. If Vertex fails it throws, and the client degrades to the
manual tap-to-time flow. There is no Replit-proxy fallback.

**Why:** The Replit AI Integrations proxy 401s in production ("ApiKey not
approved"), which is a Replit-billing condition. Keeping it as a fallback both
made karaoke depend on Replit's invoice status and masked the real Google-side
error behind a silent provider switch.

**How to apply:** Transcription must import `VERTEX_MODEL` from `geminiVertex.ts`
rather than hardcoding a model string — it previously pinned its own
`gemini-2.0-flash`, which is retired on this project and 404s, so the two paths
drifted and only lyrics got fixed. See `gemini-provider-config.md` for the
enablement procedure and the 403/404/401 triage table.
