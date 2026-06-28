---
name: Cloud Run Demucs separation
description: Neural voice/stem separation via user-deployed Google Cloud Run container running htdemucs
---

## Rule
voice_remove and stem_split check `DEMUCS_URL` env var first. If set, they call the Cloud Run container. If not set OR call fails, they fall back to DSP (mlkVocalRemoval / mlkStemSplit). Replicate is completely removed.

## Implementation
- **Node.js client**: `artifacts/api-server/src/demucsCloudRun.ts`
  - `isDemucsConfigured()` → checks `DEMUCS_URL`
  - `demucsVoiceRemove(filePath, multiplier)` → POST `/separate` with `mode=voice_remove`
  - `demucsStemSplit(filePath, multiplier)` → POST `/separate` with `mode=stem_split`
  - Auth: `x-api-key: REMOTE_KERNEL_API_KEY` header
  - Returns stems as base64 WAV in JSON; applies MLK v3 via `applyMLKv3Fast`
  - Timeouts: 300s voice_remove, 600s stem_split

- **Python container**: `python-api/main.py` — POST `/separate` endpoint (appended at bottom)
  - Saves upload to tempfile, runs `python -m demucs -n htdemucs [--two-stems vocals] -o outdir`
  - Reads stem WAVs from `outdir/htdemucs/{track_name}/` and returns as `{ stems: { name: base64 }, model: "htdemucs" }`
  - For stem_split: also ffmpeg-mixes non-vocal stems into "instrumental" track

- **Dockerfile** (`python-api/Dockerfile`): torch 2.3.1 CPU + demucs, htdemucs model pre-downloaded at build time

## Deploy command (run from Replit Shell or Google Cloud Shell)
```bash
gcloud run deploy gkp-demucs \
  --source python-api/ \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 8Gi \
  --cpu 4 \
  --timeout 600 \
  --set-env-vars DEMUCS_API_KEY=<same-value-as-REMOTE_KERNEL_API_KEY> \
  --project <gcp-project-id>
```

After deploy, set `DEMUCS_URL` in Replit secrets to the Cloud Run service URL.

**Why:** User rejected Replicate (cost/control). Wants own Google Cloud Run container for htdemucs. GCP_SERVICE_ACCOUNT exists; REMOTE_KERNEL_API_KEY is reused as the shared secret.

**How to apply:** Until DEMUCS_URL is set, all separation silently falls back to DSP — that's correct behavior, not a bug. The route never 500s.
