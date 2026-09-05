---
name: Export quota pattern
description: Rolling 30-day WAV/MP3 export cap (20) applies to paid tiers too; atomic reset-or-increment rules
---

Owner directive (2026-08-14): WAV/MP3 exports are capped at **20 per rolling 30 days for ALL users, including paid subscribers** ("limit, not unlimited for pro"). Bypasses: `isDeveloper` accounts and partner API-key requests only.

**Covered outputs** — every route that hands the user WAV/MP3 bytes must consume: track downloads, kernel master (paid path), convert (wav/mp3 formats only; flac/m4a/ogg exempt), and `/kernel/process-audio` (standard WAV, voice-remove MP3/WAV, stem ZIP). 429 payload code `EXPORT_LIMIT_REACHED`; `/api/usage/status` exposes `exports {used, limit, remaining, resetsAt}`.

**Why atomic:** the naive "if window expired, UPDATE to 1" races — concurrent requests at a window boundary each reset to 1 and blow past the cap. The consume must be ONE UPDATE whose CASE/WHERE evaluate the *current row* (expired → reset to 1, else guarded increment `monthly_exports < limit`), status derived from RETURNING. The `INTERVAL '30 days'` literal must stay in sync with the JS period constant.

**How to apply:** check quota before expensive processing (cheap read), consume only after success right before streaming bytes — never on both a POST and its result-fetch GET (double-count). Free-tier FREE_LIMITS counters stay layered on top, untouched.

Bearer-sid test auth requires a row in the `sessions` table (`sess = {"user":{"id":...}}`), not just `users.session_id`. `process-audio` requests also need `author_assertion=true` or ingestion validation 422s.

Unlimited quota responses use `remaining: -1`; every UI gate must check `unlimited` before treating `remaining <= 0` as exhausted.

**Why:** A lifetime/developer account was incorrectly shown a payment-style export wall because the UI interpreted the unlimited sentinel as zero-or-less remaining.

**How to apply:** Use the explicit `unlimited` flag for badges, disabled states, and limit messaging; never infer unlimited status from the numeric remaining value.
