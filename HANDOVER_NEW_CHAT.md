# GravelKing Pro — New Chat Handover

Use this handover as the first message in a new chat so work can continue without relying on the overloaded conversation history.

## Current product

GravelKing Pro is the production creator-audio platform at:

- https://gravelkingpro.com

Main product areas:

- JAX songwriting assistant with persistent sessions, voice playback, autosave/restore, ownership checks, and deletion
- Lyrics editing, authorship tracking, forensic edit evidence, and copyright certificates
- Vocal Booth and karaoke tools
- MLK v3.5 mastering
- Unmastered AI generation/remix, with mastering as a separate paid action
- Audio downloads, credits, subscriptions, Stripe, Google Play Billing, referrals, and admin tools
- Android TWA / Play compliance support

## Important product decisions

- Production domain is `gravelkingpro.com`; the old `.it.com` domain is retired.
- MLK v3 is the sole mastering DSP.
- Generation and remix routes must remain unmastered.
- JAX uses `HTMLAudioElement`, not browser speech synthesis.
- Typing must not interrupt JAX playback.
- Sending, microphone activation, session changes, voice changes, manual stop, and leaving JAX must stop playback.
- Authorship scores remain 0–100 because the copyright gate depends on that range.
- Certificate generation and entitlement checks must remain server-side.
- Paid mastering jobs use durable database records and private object storage, but the DSP is still request-bound/in-process rather than a fully detached worker.
- Do not reintroduce deprecated cloud-AI, Replicate, splitter, or voice-removal product pillars.

## Current workspace state

Healthy/running:

- `artifacts/gravelkingpro: web`
- `artifacts/api-server: API Server`

Not relevant to GravelKing Pro and currently failed/finished:

- `artifacts/mlk-pitch-deck: web`
- `artifacts/mlk-licensing: web`
- `studio-audio`
- mockup-sandbox workflow

Do not restart the unrelated MLK workflows unless explicitly requested.

## Latest completed work

- Task 263 was merged at commit `09bb0027e69f1467402db475f6cb651fed42eaff`.
- That work releases full-length audio resources immediately when users cancel fine-tuned export.
- The following related tasks were cancelled:
  - Task 264: canceled fine-tuned exports after a backgrounded tab resumes
  - Task 272: canceled fine-tuned exports on Safari/iPhone
  - Task 273: reduce peak memory while encoding a fine-tuned WAV
- Task 260 was cancelled.
- Task 190 was cancelled.

## Current project tasks

In progress:

- Task 124 — Show the AI model and copyright-clearance badge where certificates are viewed

Pending and blocked by concurrency:

- Prevent a failed publish from leaving the private kernel repo half-synced
- Let the admin filter and sort the investor list by status or overdue urgency
- Catch a stale kernel file before it survives a publish
- Make sure the sitemap stays protected from being dropped in any future publish
- Prevent duplicate Stripe catalog objects from changing what checkout sells
- Confirm fine-tuned WAVs stay identical on Safari and iPhone
- Catch clipping when aggressive EQ settings are exported

Do not implement pending tasks automatically. Wait for an explicit assignment.

## Key files and areas

- `artifacts/gravelkingpro/src/pages/songwriting.tsx`
  - JAX UI, sessions, playback, autosave/restore, deletion
- `artifacts/api-server/src/routes/jax.ts`
  - JAX voice presets, TTS, session deletion
- `artifacts/api-server/src/lib/firestore.ts`
  - JAX ownership and persistence helpers
- `artifacts/gravelkingpro/src/pages/mastering.tsx`
  - Active job tracking, polling, and completed-output hydration
- `artifacts/api-server/src/routes/master.ts`
  - Mastering job creation, progress, output persistence, status, downloads
- `artifacts/api-server/src/app.ts`
  - Startup stale-job recovery
- `lib/db/src/schema/master_jobs.ts`
  - Durable `jobs` table
- `lib/db/src/schema/auth.ts`
  - Users and sessions
- `lib/db/src/schema/lyrics.ts`
  - Lyrics, revisions, imports, timeline blocks, forensic ledger

## Known constraints and pitfalls

- Development and production use separate Postgres databases.
- `executeSql()` targets development; production queries require the production environment.
- Never attempt the previously cancelled production PostgreSQL export unless explicitly requested again.
- Production schema changes require the normal publish/database flow; startup-only DDL can be dropped during publish.
- Stripe webhook handling and checkout are sensitive to idempotency, session cookies, mirror lag, and managed connector field names.
- Do not expose or print secrets.
- Do not attempt more Git operations unless explicitly requested. The prior authenticated push failed because existing history contains Git LFS objects and GitHub returned `LFS: Not Implemented`.
- The private GitHub repository synchronization was not verified by the last direct shell push.
- The old conversation became unstable after many large video asset cards were posted. Do not post large batches of media cards in the new chat.
- Existing media assets are already registered in the Library. Prefer referring to the Library or using one small archive/document rather than reposting many assets.

## Chat-continuation instructions

Start the new chat by saying:

> Continue GravelKing Pro work from `HANDOVER_NEW_CHAT.md`. Do not repost large media assets. Do not restart healthy workflows. Ask before taking action on pending tasks. First confirm the current status of Task 124 and the two running workflows, then continue only from my newest instruction.

If the new chat asks what to do next, do not infer a new implementation task from this handover. Ask which specific task or product area to work on.
