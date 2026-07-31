---
name: Gemini transcription dual provider
description: Audio transcription tries Vertex AI first, falls back to Replit Gemini proxy; Vertex is 403 (aiplatform API disabled in the GCP project)
---

POST /api/audio/transcribe uses a dual-provider chain: Vertex AI gemini-2.0-flash via GCP_SERVICE_ACCOUNT first, then the Replit AI Integrations Gemini proxy (gemini-2.5-flash) on failure. Only when both fail does it return 502 → client tap-to-time fallback.

**Why:** The GCP project tied to GCP_SERVICE_ACCOUNT has the aiplatform (Agent Platform/Vertex AI) API DISABLED → Vertex returns 403 and cannot be enabled from inside Replit; only the user can enable it in Google Cloud Console. The Replit proxy accepts inlineData audio parts and works in dev; note the earlier memory that the proxy can 401 in production — if prod transcription starts 502ing, that's the first suspect.

**How to apply:** Provider logic lives in the transcription module next to the shared Vertex/proxy clients; both use identical generateContent bodies (mono 16kHz 32kbps MP3 inline, JSON segments response). If the user enables the Vertex API, no code change needed — Vertex automatically wins again.
