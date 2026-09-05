# GravelKing Pro — Next Chat Handoff

Updated: 2026-08-03

## Current workspace state

- Main product: GravelKing Pro audio platform.
- Live website: `https://gravelkingpro.com`
- Main web artifact: `artifacts/gravelkingpro`
- Shared API artifact: `artifacts/api-server`
- Mobile artifact: `artifacts/gravelkingpro-mobile`
- Morris Law Kernel v3.5 is Python-based; the live gateway is Express/Node.js.
- Do not describe the live gateway as FastAPI. A standalone FastAPI verification wrapper exists in `MorrisLawKernel/verification_api.py`, but it is not the current production gateway.

## Current task state

- Task #44 (Build standalone CRUD dashboard) exists but is blocked by the project concurrency limit.
- Do not start that dashboard until the task becomes executable.
- Existing project tasks include Play release, Stripe, SEO, demo-account, admin navigation, and kernel verification work. Check the task list before creating duplicates.

## API partner integration

- Partner ingest route exists in source as:
  - `POST /api/v1/ingest`
  - `POST /api/kernel/master`
- Authentication is `x-api-key`.
- The partner key is derived from the workspace server secret and must never be printed, committed, or put in chat.
- Certification is opt-in with `certify=true`; ownership assertion is required by the certification validation flow.
- The response is a mastered WAV with MLK headers and certificate information when certification is requested.
- The API currently has a 3-job mastering concurrency limit and a partner quota of 300 requests per 10 minutes.
- A 500-track pilot still needs a queue, retries, job status, idempotency, and callbacks before being called a production batch system.
- The source change is currently uncommitted in `artifacts/api-server/src/routes/master.ts`.
- The development API was tested successfully. The currently published site/API previously returned 404 for `/api/v1/ingest` because the new source had not been republished.

## IP validation model

- WAV/PCM LSB watermark carries Anchor A / nominator and certificate ID.
- Server retains Anchor B / denominator and the HMAC record.
- SHA-256 fingerprints content; HMAC-SHA256 validates the split proof.
- This is not Diffie-Hellman.
- Lossy MP3/AAC conversion can destroy the LSB watermark.
- Verification route: `POST /api/kernel/verify-signal`.
- Verdicts include `INTACT`, `TAMPERED`, and `NO_WATERMARK`.

## Verification results

- API test suite passed:
  - whitepaper endpoints
  - MLK audio processing
  - price parity
  - download token security
  - delivery expiration
- Controlled load test passed:
  - health: 1,000/1,000 HTTP 200
  - MLK v3: 500/500 HTTP 200
  - raw baseline: 1,000/1,000 HTTP 200
  - invalid payloads: 200/200 clean HTTP 400
  - missing routes: 200/200 clean HTTP 404
- Full workspace typecheck is not clean because Expo has a pre-existing `WebView` typing error in `artifacts/gravelkingpro-mobile/app/(tabs)/index.tsx`.
- API health is currently HTTP 200.

## Stability notes

- Running all artifact workflows simultaneously creates unnecessary CPU pressure.
- Expo and the main Vite process were the largest CPU users during the investigation.
- No out-of-memory, unhandled rejection, fatal, or port-collision errors were found in the latest logs.
- Keep only the main web app and API running during normal work; restart optional artifacts only when actively using them.
- Use the exact managed workflow names from the workspace when restarting an artifact.

## Safe commands

```bash
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run dev
pnpm run typecheck
curl http://localhost:8080/api/healthz
```

## Do not do without an explicit request

- Do not rotate or display any API key or server secret.
- Do not replace PostgreSQL with SQLite.
- Do not reintroduce deprecated cloud-AI, Replicate, splitter, or voice-removal product copy.
- Do not call the live partner API production-ready for 500-track bursts until queueing and retry behavior exist.
- Do not claim the LSB certificate proves legal ownership by itself; it validates the issued signal and stored certificate chain.