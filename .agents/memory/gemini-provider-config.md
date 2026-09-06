---
name: Gemini provider config
description: GravelKingPro's Gemini features run on the owner's Google Cloud Vertex AI only; the Replit AI proxy was removed, plus the model/API pitfalls that broke it.
---

# Gemini provider configuration

All Gemini features (songwriter/lyrics, vocal transcription) run **exclusively on
the owner's own Google Cloud Vertex AI** via the `GCP_SERVICE_ACCOUNT`
service-account JSON key. There is no second provider.

**Why:** The Replit AI Integrations Gemini proxy (`AI_INTEGRATIONS_GEMINI_*`) was
previously wired as a fallback/race partner. In production it returns
`401 ApiKey not approved`, which is a Replit-billing/approval condition. That
made a core paid product feature depend on Replit's invoice status — the
songwriter went down in the published Google Play app for exactly this reason.
Owner directive: no Replit AI dependency in production.

## Two failure modes that both had to be fixed

1. **Vertex API disabled.** `aiplatform.googleapis.com` was DISABLED on the GCP
   project, so every Vertex call returned 403 and traffic silently fell through
   to the Replit proxy. This is enableable from inside the workspace — the
   service account has Service Usage permission. Enable it by POSTing to
   `https://serviceusage.googleapis.com/v1/projects/<project_id>/services/aiplatform.googleapis.com:enable`
   with a `google-auth-library` client scoped to `cloud-platform`, then poll the
   returned operation until `done`.
2. **Retired model name.** `gemini-2.0-flash` 404s on this project
   ("Publisher model ... was not found"). `gemini-2.5-flash` works. `VERTEX_MODEL`
   in `geminiVertex.ts` is the single source of truth — transcription previously
   hardcoded its own model string and drifted; it now imports `VERTEX_MODEL`.

**How to apply:** If lyrics or transcription start failing, curl the Vertex
`generateContent` endpoint directly with the service account before touching app
code — it distinguishes "API disabled" (403), "model retired" (404), and
"credential bad" (401) instantly. Never re-add a Replit-proxy fallback to make a
failure disappear; it hides the Google-side cause and reintroduces the billing
dependency. `geminiProxy.ts` still exists but is intentionally unreferenced.

## Running scripts against Google from the workspace
`google-auth-library` resolves from `artifacts/api-server/node_modules`, so a
one-off script must live **inside that package directory** — running it from
`/tmp` fails with `ERR_MODULE_NOT_FOUND` because Node resolves imports relative
to the script's own path, not the cwd. The CodeExecution sandbox was erroring
("durable ptc") during this work; a plain Node script via shell was the reliable
path.

## Vertex tool placement
Vertex `generateContent` accepts `tools` at the top level, not inside
`generationConfig`. Passing the same search tool in both places causes a 400
`Unknown name "tools" at 'generation_config'`, which surfaces as a JAX outage.

**Why:** The JAX route uses Google Search grounding for current/factual prompts,
so a malformed request can make ordinary chat appear intermittently unavailable.

**How to apply:** When adding generation options, destructure `tools` before
serializing `generationConfig`; verify both a grounded lookup and a lyric request
through `/api/jax/generate`, not only a direct model probe.
