---
name: RVC model URL filename constraint
description: Replicate RVC cannot consume GCS signed URLs with query strings — it derives a local filename from the full URL and crashes with ENAMETOOLONG
---
The zsxkib/realistic-voice-cloning model builds its local filename from the raw download URL. A native GCS V4 signed URL (long X-Goog-Signature query string) fails inside the prediction with `[Errno 36] File name too long`. Only a clean-path URL ending in `/gravelking_v2.zip` with no query string works.

**Why:** Verified live — GCS signed URL produced the Errno 36 failure; the HMAC clean-path route `/api/jax/rvc-model/<exp>/<sig>/gravelking_v2.zip` completed the full conversion (prediction `4pk694yzgsrg80d0j7wr5t2a4g`).

**How to apply:** Always pass `buildSignedRvcModelStreamUrl("https://" + host)` output as `custom_rvc_model_download_url`, never a storage.googleapis.com signed URL. The clean-path route serves the ZIP from the fallback bucket and was verified reachable anonymously by Replicate (HTTP 200, 75 MB, PK magic).
