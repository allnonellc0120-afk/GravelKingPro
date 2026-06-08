# Threat Model

## Project Overview

GravelKingPro is a public-facing Express + TypeScript application with a Vite web frontend and PostgreSQL database. It offers audio processing, mixing, and Stripe-backed subscriptions; some functionality is anonymous, some uses OIDC sessions, and some premium access is tracked via a separate `gk_session` cookie. The currently relevant production surface is the deployed web/API stack, not the mockup sandbox.

## Assets

- **User sessions and identities** — OIDC-backed `sid` sessions and anonymous `gk_session` subscription cookies control access to billing and premium features.
- **Subscription and billing state** — Stripe customer IDs, subscription rows mirrored into `stripe.*`, and billing portal access determine who can manage paid plans.
- **User-uploaded audio** — public and authenticated upload flows send attacker-controlled files into ffmpeg/Python processing pipelines on the server.
- **Application secrets** — `DATABASE_URL`, Stripe credentials, managed webhook secrets, admin key, and remote kernel API keys would allow compromise of data or payment operations.
- **Service availability and spend** — ffmpeg, Demucs, and mix/export endpoints are CPU-, memory-, and disk-intensive and can be abused for denial of service or cost amplification.

## Trust Boundaries

- **Client to API** — browsers and mobile clients are untrusted; all entitlement, auth, and input validation must be enforced server-side.
- **API to database** — the API has direct write access to app tables and mirrored Stripe tables.
- **API to Stripe / Replit connectors** — checkout, portal sessions, and webhook sync cross into third-party payment infrastructure.
- **API to local filesystem / subprocesses** — uploaded files are written to disk and processed by ffmpeg and Python, creating a high-risk boundary for path handling and resource abuse.
- **Anonymous to paid features** — several product features are public while others are marketed as paid; this boundary must be enforced on the backend rather than only in the UI.
- **Sibling deployment boundary** — other public `*.replit.app` sites must be treated as attacker-controlled origins even though browser same-site cookie rules may allow cookies to flow between them.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/**`
- Highest-risk areas: `routes/stripe.ts`, `routes/auth.ts`, `middlewares/authMiddleware.ts`, `routes/audio.ts`, `routes/master.ts`, `routes/studio-mix.ts`, `gkp-separator.ts`
- Public surfaces: health, checkout/products, subscription status, beat streaming, waitlist, beatmaker, several audio-processing routes
- Authenticated surfaces: `/api/auth/user`, `/api/logout`, `/api/kernel/history`
- Dev-only areas to usually ignore: `artifacts/mockup-sandbox/**`, most build-time Expo tooling unless production reachability is shown

## Threat Categories

### Spoofing

The application uses both OIDC sessions (`sid`) and an anonymous subscription cookie (`gk_session`). The server must treat both as sensitive authenticators: session identifiers must be unpredictable, mapped server-side, and never trusted across billing or entitlement boundaries without backend verification. Stripe webhooks must continue to require signature verification on the raw body.

### Tampering

Uploaded audio, multipart form fields, and request headers are all attacker-controlled. Any value that reaches filesystem paths, subprocess arguments, Stripe return URLs, or entitlement decisions must be normalized and validated on the server. Premium feature access must not depend on client-side state, local storage, or UI-only gates.

### Information Disclosure

The API should not reveal internal infrastructure details, secrets, mirrored billing metadata, or other users' subscription state. CORS decisions must be constrained to exact trusted origins rather than reflected broadly, especially on a shared `replit.app` site boundary where sibling deployments are untrusted.

### Denial of Service

Public processing routes accept large uploads and invoke expensive local compute. Production guarantees must include bounded upload sizes, bounded concurrency and rate limits, and safe handling of long-running ffmpeg/Python work so unauthenticated users cannot exhaust CPU, memory, disk, or autoscaling budget.

### Elevation of Privilege

Paid-feature boundaries are security boundaries in this project because they gate server resources and billing-backed capabilities. Routes that provide premium processing, exports, or billing actions must enforce the required subscription or identity server-side. Same-site cookies alone are not a sufficient defense for cross-origin access when sibling deployments can be attacker-controlled.
