---
name: Studio-gated audio dev verification
description: How to verify Studio(monthly)-gated audio routes in dev, plus the stereo-fixture gotcha for center-cancel/voice-remove parity checks
---

How to verify the paid Studio audio paths (`process-audio` mode=standard, `studio-mix`) end-to-end without touching production code.

## Bypassing the Studio gate in dev (no auth UI)
- The `gk_session` → Stripe entitlement path is **unusable in dev**: the `stripe.*` mirror tables are empty, so the lookup 500s. Use the OIDC path instead.
- Seed one `public.users` row with `subscription_tier='monthly'` and one `public.sessions` row. Authenticate by sending the unsigned session id as `Authorization: Bearer <sid>` (the server's `getSessionId` accepts the Bearer form). `resolveTier`'s OIDC branch reads `users.subscription_tier` by `req.user.id`.
- **Cleanup must also delete `public.process_runs` rows for that user** (authenticated runs insert a row; it FK-references `users`, so delete children first), then `sessions`, then `users`. Re-test the gate afterwards → expect `403` again, and confirm `git status` clean.

## Exercising the remote-kernel branch
- The real remote kernel is **offline in dev** (a Cloud Run URL). To exercise `audio.ts`'s remote branch, point `REMOTE_KERNEL_URL` at a local mock and drive the real router.
- This repo's `api-server` has **no tsx**; dev = `build.mjs` (esbuild) → `node dist`. To run a one-off harness that imports server TS, bundle it with esbuild **mirroring build.mjs** (bundle workspace deps; only native modules external; the pino plugin forces `outdir`). `--packages=external` fails at runtime because `@workspace/db`'s raw-TS directory imports aren't ESM-resolvable.
- **Caveat:** `tryRemoteProcessing` only checks the remote `content-type` contains `audio`; it does not validate RIFF/WAV before forcing `audio/wav` + `X-GK-Kernel: MLK_v3`. A mock proves branch behavior, not that the production remote returns valid WAV.

**Why:** these are environment quirks (empty stripe mirror in dev, offline remote, no tsx) not visible from code alone.

## Center-cancel parity fixture gotcha
- For center-cancel / voice-remove paths (filter `c0=c0-c1`), a stereo fixture where **L==R** (e.g. a duplicated mono sine) cancels to digital silence; `applyMLKv3` then sees zero RMS and reports `MLK_V3_VIOLATION` — a **false positive**, not a regression.
- Always use **true-stereo** fixtures (distinct L/R content, e.g. 440 Hz L / 523 Hz R) when validating center-cancel or stem parity.
