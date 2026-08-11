---
name: Lyria 3 on Vertex AI
description: How to call Lyria 3 music generation on the owner's Vertex project — required API surface, location, and failure modes
---

# Lyria 3 on Vertex AI

The rule: Lyria 3 models (`lyria-3-pro-preview`, `lyria-3-clip-preview`) are ONLY served through the Interactions API on Vertex:

```
POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions
Body: { "model": "lyria-3-pro-preview", "input": "<prompt incl. lyrics>" }
```

**Why:** `:predict` returns 404 and `:generateContent` returns 400 INVALID_ARGUMENT for Lyria 3 (confirmed live on the owner's project and in googleapis/python-genai#2533). Location must be `global` (no region prefix on the host); regional endpoints 500/404.

**How to apply:**
- Response schema: `steps[] → type:"model_output" → content[] → {type:"audio", data:<base64>, mime_type:"audio/mpeg"}` (MP3 out), lyrics come back as text blocks. May be async — poll `GET .../interactions/{id}` until `status:"completed"`.
- `lyria-002` (`:predict`, regional) is instrumental-only, 32.8 s clips — it REJECTS prompts containing lyric text with a policy-ish 400, so it is NOT a fallback for sung-vocals features.
- Lyria's content filter rejects some lyric prompts with "sensitive words / Prohibited Use policy" 400s — surface that error verbatim to the user; it's an upstream policy rejection, not a wiring bug.
- Implementation lives in the api-server orchestrator service for the `/api/mlk/v35/generate-master` route (full pipeline: lyric hash → Lyria → real MLK kernel → Dual-Anchor cert → tracks/purchased_tracks vault).
