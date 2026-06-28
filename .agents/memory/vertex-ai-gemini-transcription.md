---
name: Vertex AI Gemini transcription
description: How audio transcription is authenticated and called — Vertex AI via GCP_SERVICE_ACCOUNT, not Replit proxy
---

## Rule
POST /api/audio/transcribe calls Vertex AI Gemini (gemini-2.0-flash) authenticated with `GCP_SERVICE_ACCOUNT`. This bills the user's Google Cloud project — NOT Replit AI credits. Do NOT use `AI_INTEGRATIONS_GEMINI_*` env vars for audio transcription.

## Implementation
- `artifacts/api-server/src/geminiTranscribe.ts` — standalone module
- Uses `google-auth-library` (already a direct dep of api-server) with `GoogleAuth({ credentials: { client_email, private_key } })`
- Same GCP_SERVICE_ACCOUNT JSON parsing pattern as `lib/firestore.ts` (project_id + client_email + private_key)
- Access token is cached in memory (1h TTL, refreshed 60s before expiry)
- Audio compressed to mono 16kHz 32kbps MP3 via ffmpeg before sending as base64 inline data (≤7MB)
- Endpoint: `https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent`
- Returns `{ segments: { text, start, end }[], fullText }` — same shape as the old Replicate Whisper response

**Why:** User explicitly rejected Replit proxy (billing concern) and Replicate. GCP_SERVICE_ACCOUNT is already provisioned for Firestore; reusing it avoids a separate key.

**How to apply:** If transcription breaks with 403/404 from Vertex AI, the likely cause is either (a) Vertex AI API not enabled on the GCP project, or (b) the service account lacks `roles/aiplatform.user`. User must enable `aiplatform.googleapis.com` and grant that role.
