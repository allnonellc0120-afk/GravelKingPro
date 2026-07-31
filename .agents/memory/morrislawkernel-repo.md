---
name: MorrisLawKernel standalone repo
description: Where the standalone MLK v3.5 showcase repo lives and the rules its contents must follow
---

# MorrisLawKernel standalone repo

Private GitHub repo `allnonellc0120-afk/MorrisLawKernel` (branch `main`). Local staging copy: `MorrisLawKernel/` at workspace root (kept deliberately, not a pnpm package; keep it in sync with the repo).

**Rule:** ip_protection_system.ts and robust_embed.ts are verbatim user-provided showcase files — do not refactor or "improve" them unless asked. morris_law_kernel.py and app.py were REWRITTEN under explicit user work orders (July 2026 "Grok V3.5" upgrade: Numba JIT, bass-aware sidechain, auto-threshold, RBJ shelves, 5-band isolator, BS.1770 normalize) — they are maintained code now, not verbatim relics; don't "restore" older versions.

**DSP invariants (violations were real shipped bugs):** an EQ shelf must be an RBJ shelving biquad — a pass-filter + makeup gain is NOT a shelf; `lfilter` on (n,2) audio needs `axis=0`; neutral compressor ratio is 1 (interpolate `1 + S*(max-1)`, never `S*max`); loudness is never manufactured — silence stays silent (warn + skip normalize) and the output ceiling wins by transparent gain trim, never clipping. Regression style that caught all of these: round-trip metering — process a moderate-crest program and assert measured integrated LUFS lands on target; unit-level checks alone missed every one. verification_api.py + app.py perform live verification against the public no-auth endpoint `POST gravelkingpro.it.com/api/kernel/verify-cert` (multipart field `audio`); the Python LSB extractor must stay bit-identical to the server's kernel-v3 scheme. lyric_detector.py is an authored advisory pre-flight scanner (3-line n-gram hashes, hashes-only local vault, env-gated sync); its stamp hash must stay byte-identical to the server lyric-stamp normalization — replicate JS trim()/multiline-$ semantics explicitly, Python strip()/MULTILINE diverge (BOM, NEL, lone CR).

**Why:** Split-key security model — the repo must NEVER contain or reimplement the server-side denominator/HMAC handshake (SESSION_SECRET stays server-only). Only a well-formed HTTP 200 JSON verdict counts as a verdict; any backend failure must surface as a failure, never as "certified"/"not certified" (false negatives are fabricated verdicts too).

**How to apply:** Repo updates go through the connectors-sdk proxy pattern (see github-connector-usage). If the server-side LSB scheme or verify endpoint contract ever changes, the repo client must be re-parity-tested against kernel-v3.
