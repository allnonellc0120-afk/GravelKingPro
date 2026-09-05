---
name: JAX route must call the live model
description: /api/jax/generate previously echoed req.body.text with a canned fallback — generation routes must never return placeholder strings
---

A handover edit left `/api/jax/generate` returning `req.body?.text || "Let's shape that section together..."` — no LLM call at all. Users saw the same canned line on repeat and an internal admin-header error leaked into chat.

**Why:** Any canned string in a generation route is indistinguishable from a working-but-dumb model until a user notices looping. Owner directive: no simulated/fake returns anywhere; on provider failure, throw the real error (502) so logs show the exact cause.

**How to apply:** JAX calls Vertex `generateVertexText` first, proxy `generateProxyText` as fallback, 502 on total failure — never a placeholder. Chat client sends `history` (last 12 msgs) so JAX has conversation context; unauthenticated users get a friendly 401, not internal auth wording. Verify changes to any generate route with a live unique prompt, not a shape-check.
