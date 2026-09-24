# GravelKing Advantage (GKA) — New Chat Handover

Updated: 2026-09-13

## Workstream boundary

This is the **GravelKing Advantage (GKA)** workstream. Treat it as separate from the **GravelKing Pro** creator-audio product and its music, mastering, vocal booth, karaoke, IP-certification, and mobile-app work.

### GKA product

GKA is an AI-infrastructure and cost-optimization product. Its landing page is:

https://site-7pttyhbyr.godaddysites.com/

Current positioning:

- Reduce multi-turn LLM token costs by up to 80%.
- Remove redundant context before provider billing.
- Preserve strict schema fidelity and avoid output drift.
- Provide zero-risk proxy plumbing for a controlled staging pilot.
- Keep 67% of validated savings.
- Current offer: five pilot teams, no upfront cost.

Do not use the creator-audio product language when working on GKA. Do not reintroduce deprecated cloud-audio splitter, voice-removal, or automatic-mastering work into GKA.

## Current GKA deliverable

The existing slide artifact `artifacts/gravelking-b2b-partnership-deck` now contains an added GKA prospecting section:

- Slides 9–15: GKA prospecting brief.
- 50 ranked AI workflow companies.
- Each prospect includes company name, what it does, public email/contact route, and the GKA fit.
- Retell AI is the first outreach target.
- Verified public Retell support email: `support@retellai.com`.
- The deck explicitly labels unverified commercial routes as “Official sales/contact route”; never invent sales addresses.

Official source for Retell’s public email:

https://docs.retellai.com/general/support

The landing page and GKA positioning are also recorded in `replit.md`.

## GKA-related code and data

- `lib/gka_middleware.py` — shared `GKAdvantageCore`, lineage, parity validation, slicing, and audio optimization boundary.
- `gka_spec.json` — GKA runtime specification.
- `artifacts/api-server/src/lib/liveTelemetryConfig.ts` — fail-closed telemetry client configuration.
- `artifacts/api-server/src/routes/telemetry.ts` — live telemetry endpoint.
- `artifacts/api-server/src/lib/telemetryReports.ts` — scheduled telemetry reports and email delivery.
- `artifacts/api-server/data/token_savings_ledger.jsonl` — telemetry ledger; do not expose the unfiltered ledger.
- `scripts/generate-pre-push-audit-dump.mjs` — source audit dump generation.
- `artifacts/pre_push_audit_dump.json` — generated audit artifact.
- `artifacts/gravelking-b2b-partnership-deck` — current GKA prospecting presentation section.

## Important architecture decisions

- Telemetry is capability-token based, fail-closed, client-isolated, and must never expose the raw unfiltered ledger.
- GKA’s token accounting uses exact `cl100k_base` accounting.
- GKA savings/gain-share calculations and customer-zero reporting are already implemented.
- Owner-controlled Vertex AI is the approved Gemini path; do not switch GKA to the Replit Gemini proxy.
- The current Vertex model is `gemini-2.5-flash`; do not reintroduce retired model names.
- Production and development databases/storage are separate.
- Do not delete database records, source files, audio buckets, or storage objects while investigating unrelated failures.

## Secrets and integrations

Never paste credential values into chat, commit them, or put them in this handover. Future agents should use the Replit Secrets and Integrations surfaces.

### GKA/API runtime names

- `GCP_SERVICE_ACCOUNT` — owner’s Google Cloud service-account JSON for Vertex AI. This is the required owner-Vertex credential; the value is already managed as a secret.
- `SESSION_SECRET` — server session signing.
- `CLERK_SECRET_KEY` — server-side Clerk integration where the API is involved.
- `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` — Clerk client configuration where the API/web app is involved.
- `DATABASE_URL` — environment variable for the current database.
- `ADMIN_KEY` — admin smoke-test/authentication flows.
- `REMOTE_KERNEL_API_KEY` — only for the configured remote kernel path; do not use as a substitute for the owner Vertex credential.

### Optional project infrastructure names

These belong primarily to the GravelKing Pro audio/API product and should not be added to a GKA-only task unless the task explicitly requires them:

- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`
- `PRIVATE_OBJECT_DIR`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`
- `ELEVENLABS_API_KEY`
- `REPLICATE_API_TOKEN`
- `STRIPE_SECRET_KEY` / Stripe integration credentials
- `GITHUB_PAT`
- `GODADDY_API_KEY` / `GODADDY_API_SECRET`

The `AI_INTEGRATIONS_GEMINI_*` proxy values are not the approved owner-Vertex path for GKA.

## Workflows and verification

The presentation workflow is:

```text
artifacts/gravelking-b2b-partnership-deck: web
pnpm --filter @workspace/gravelking-b2b-partnership-deck run dev
```

Useful checks:

```bash
pnpm --filter @workspace/gravelking-b2b-partnership-deck run validate-slides
pnpm --filter @workspace/gravelking-b2b-partnership-deck run typecheck
pnpm --filter @workspace/gravelking-b2b-partnership-deck run build
```

The standalone Python MLK workflow (`PORT=5000 python3 main.py`) is a separate GravelKing Pro/audio service. Do not restart or modify it for presentation-only GKA work.

## Outreach priority

Start with:

1. Retell AI — voice-agent context and tool schemas.
2. Vapi — developer voice-agent infrastructure.
3. Bland AI — high-volume autonomous phone agents.
4. PolyAI — enterprise contact-center voice AI.
5. ElevenLabs — voice agents and enterprise content workflows.

The recommended pilot should measure:

- Input-token reduction.
- Total provider-cost change.
- End-to-end latency.
- Tool/schema fidelity.
- Output quality and task completion.
- Failure and rollback behavior.

## Handoff rules for future agents

- Confirm whether a request is for **GKA** or **GravelKing Pro** before editing.
- For GKA prospect research, cite official company pages and use public business inboxes only.
- If no official email is verified, write “official sales/contact route” rather than guessing.
- Do not request or reveal secret values. Refer to the secret name and use the workspace secrets flow.
- Keep GKA prospecting, telemetry, and token-optimization work separate from the creator-audio product’s mastering and media pipeline.