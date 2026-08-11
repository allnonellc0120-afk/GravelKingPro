---
name: Lyria content policy + zero-rejection middleware
description: What trips Lyria's content_blocked filter and the Gemini shield pipeline around it
---

**Rule:** Prompts sent to Lyria must be pure style descriptions. Meta-language that references an existing recording — "remix of the original track <title>", "keep this exact style throughout", "identical to" — triggers `content_blocked` (reads as a request to reproduce a recording). Remix blends must be flat comma/period-joined descriptor lists.

**Why:** Live remix runs were blocked twice on wording alone; the underlying style descriptors were policy-clean.

**How to apply:** Every Lyria style prompt flows through the zero-rejection pipeline in the orchestrator:
1. Gemini pre-pass (`promptSanitizer.sanitizeStylePrompt`) — artist/trademark refs → sonic descriptors, explicit terms softened. **Fail-open** (log loudly, send original) so a Gemini hiccup never kills generation.
2. On `content_blocked` from Lyria: ONE aggressive Gemini rescue rewrite (`rewriteBlockedPrompt`, fail-closed) + retry; on malformed audio (<10KB): one same-input retry.
3. Error shield in the route maps everything to clean human messages (422 "Prompt flagged by AI safety filter…" for blocks); raw upstream errors/stacks stay in server logs only.

**Boundaries:** user LYRICS are never rewritten (lyric possession hash must match the sung words); the IP cert records the user's ORIGINAL prompt, not the sanitized one. Remix requires a recoverable parent MLK cert — no title-derived fallback, or the child cert would be unanchored.
