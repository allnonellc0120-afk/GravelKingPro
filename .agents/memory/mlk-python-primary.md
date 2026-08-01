---
name: Python MLK is the sole mastering DSP
description: Mastering route runs the real Python MorrisLawKernel via subprocess; no ffmpeg DSP fallback exists by user directive; handover kernel had two signal-nulling bugs now fixed in both copies
---

The mastering route (`/api/kernel/master`) runs the real Python MorrisLawKernel as the **only** DSP path: `artifacts/api-server/python/mlk_master.py` spawned via execFile, params passed as CLI args, JSON stats on last stdout line. ffmpeg remains ONLY for ingest (format normalize, 30s trim, afftdn denoise pre-pass). There is intentionally **no ffmpeg fallback** — worker failure = explicit 500.

**Why:** User directive — the Numba kernel is the product's moat and must be the primary/only backend code for the tools. ffmpeg approximation was removed entirely.

**How to apply:**
- The two kernel copies must stay in sync: `artifacts/api-server/python/morris_law_kernel.py` (runtime) and `MorrisLawKernel/morris_law_kernel.py` (showcase repo). The handover code had two bugs fixed in both: `lfilter` defaulted to axis=-1 (filtered the 2-sample channel axis on stereo → garbage), and `_shelf` replaced the signal with a band + cascaded lowpass→highpass (→ silence; LUFS staging then amplified residue to -14 dB, masking it). Also `stereo_link=False` crashed on 2-D convolve. Verify ANY future handover file numerically (band-content check) before wiring — "it runs" ≠ "it processes".
- Deploy: Dockerfile runner copies `artifacts/api-server/python` and pip-installs numba (`--break-system-packages`); kernel degrades to pure Python without numba. Worker path resolves via `import.meta.url` (`../python/…` from dist/), never `process.cwd()` (container cwd is /app).
- scipy.io.wavfile is used for I/O (no libsndfile/soundfile in the slim image).
