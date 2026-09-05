# Morris Law Kernel v3.5

**Court-grade IP protection + production audio DSP — the technical moat for [GravelKing Pro](https://gravelkingpro.com).**

Owner: Kevin Morris / GravelKing Productions · Proprietary (see [LICENSE](LICENSE))

## What's in here

| File | Role |
| --- | --- |
| `morris_law_kernel.py` | Mastering engine: Numba-JIT envelope/RMS kernels, stereo-linked compression, bass-aware adaptive sidechain, auto-threshold, BS.1770 loudness (pyloudnorm) + `IntelligentMultiBandIsolator` for pure-DSP stem gating |
| `ip_protection_system.ts` | IP stamping layer (split-key certificate model) |
| `robust_embed.ts` | LSB watermark embedding (nominator payload) |
| `verification_api.py` | FastAPI verification service — extracts the watermark locally, gets the **authoritative verdict from the live GravelKing server** |
| `app.py` | Streamlit frontend: Mastering · Stem Isolation · IP Verification · Lyric Pre-Flight |
| `lyric_detector.py` | Pre-flight copyright scanner: 3-line n-gram hash matcher + hashes-only local vault |
| `benchmark.py` | Honest local benchmark — measures this machine, fabricates nothing |
| `firestore_integration.md` | Server-side cert mirroring rules (server-side signing only) |

## Quickstart

```bash
pip install -r requirements.txt
streamlit run app.py                      # frontend (all tabs)
uvicorn verification_api:app --port 8000  # standalone verification service
python benchmark.py                       # measure DSP performance locally
python lyric_detector.py scan song.txt    # pre-flight lyric scan (exit 2 on overlap)
```

On Replit the included `.replit` boots the Streamlit app automatically.

## The split-key honesty model

- The **nominator** rides inside the track (LSB watermark — public by design).
- The **denominator + HMAC handshake** exist only on the GravelKing production
  server. This repo cannot and does not reimplement them.
- `verification_api.py` only reports a verdict when the live server issues one
  (HTTP 200, well-formed). Unreachable server, 4xx/5xx, or malformed responses
  surface as **backend failures (HTTP 503)** — never as "certified" or
  "not certified". Point `GRAVELKING_VERIFY_URL` at a different deployment to
  verify against it.
- The lyric pre-flight scanner is **advisory**: it screens against the local
  fingerprint vault and says so in every report. It is not legal clearance.

## DSP notes

- Numba is optional; every JIT kernel has a pure-NumPy fallback.
- `parallel=True` is used only where iterations are independent (windowed RMS).
  Envelope followers are sequential recurrences and are deliberately compiled
  without `parallel` — a `prange` there would be a data race, not a speedup.
- Stem isolation is filter-bank + adaptive energy gating: fast, model-free, and
  honest about bleed. It is not ML source separation.
