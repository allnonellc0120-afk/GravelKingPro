---
name: Voice removal — CPU neural not viable; honest free DSP
description: Why real AI vocal separation can't run server-side here, and the honest free-DSP decision + paid-cloud plan
---

GravelKing "Voice Removal": real neural separation (UVR-MDX-NET / Demucs) is NOT viable inside the Express request on this deployment.

**Why:**
- Server is CPU-only (no GPU). The UVR ONNX runner measured ~7x realtime: a 6s clip = ~104s wall (15s model load + ~43s inference + overhead). A 3-min song ≈ 20+ min → exceeds UVR_TIMEOUT (600s) and ties up a worker slot (concurrency 3).
- torch is the CUDA build (cu130, ~2GB+) and the model cache (~/.cache/audio-separator) is stripped before publish to fit the 8 GiB deploy image. So in prod `uvrVocalRemoval` failed instantly and the old code **silently `.catch()`-fell back** to the crude MLK center-cancel DSP — returning a bad instrumental as HTTP 200 (looked like success, didn't actually remove vocals). User-confirmed broken; user said "MLK is not set up to remove vocals yet."

**Decision:** `voice_remove` now routes DIRECTLY to the instant DSP (`mlkVocalRemoval`, ffmpeg center-cancel `pan=stereo|c0=c0-c1|c1=c1-c0`), ~1s, honestly labeled "instant / karaoke-style center extraction" in the UI (NOT "neural / GravelKing AI"). The silent fallback is gone; DSP use is logged via `req.log`. Verified: HTTP 200, real 320kbps stereo MP3, ~0.9s.

**How to apply:** Do NOT re-add CPU neural separation to the request path — it will hang/timeout in prod. Real AI separation is deferred to a PAID cloud GPU path. Per-song cost ~$0.02–0.10 (Replicate/Demucs) or ~$0.30–0.60 (LALAL.AI). User wants CUSTOMERS to pay for it via Stripe and will NOT cover provider charges: user holds the provider account, prices the paid tier above per-song cost. Build it as an async job (upload → create job → poll status → download), gated behind a paid tier, kept separate from the free DSP path. `uvrVocalRemoval`/`gkp_uvr_runner.py` remain in the repo but are no longer called from the request path.
