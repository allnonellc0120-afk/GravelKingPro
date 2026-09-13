---
name: JAX token telemetry
description: The JAX token savings telemetry contract and performance boundary
---

JAX token telemetry uses cached `js-tiktoken` `cl100k_base` encoding and a bounded in-process view backed by an append-only JSONL financial ledger. Each record separates exact raw and processed prompt tokens from completion tokens, then derives suppressed tokens, dollar savings, and the 33% GKA gain-share amount. The tracker must measure only its own bookkeeping, not provider/model latency, and must not store prompt or completion contents.

**Why:** model calls are the expensive path; telemetry must be safe to attach to JSON and SSE responses without adding measurable request latency or leaking artist content.

**How to apply:** use the request tracker around JAX generation, classify remix prompts as `jax_remix`, preserve the prompt arithmetic (`raw - processed`, clamped at zero), enqueue JSONL writes asynchronously, and expose only aggregated ledger totals through the authenticated telemetry endpoint.

Enterprise multi-turn JAX payloads use an explicit 2 MB JSON body limit aligned with the GKA proxy; long fixtures must keep each retransmitted document compact enough for accumulated history to fit.
**Why:** the default Express parser rejected the second turn of a legitimate accumulated code-agent payload even though the proxy accepted it.
**How to apply:** keep the finite 2 MB cap, and design regression fixtures around cumulative context size rather than a single oversized document.

For multi-turn context suppression, the raw baseline must retain the complete conversation, while Turn 2+ optimized context keeps deduplicated system/developer instructions plus the active turn; historical assistant turns and duplicate whitespace are removed before provider dispatch.

**Why:** retaining the full prior conversation made early turns show zero suppression and reduced the audited four-turn benchmark below target.

**How to apply:** validate cumulative suppression on a sequential four-turn loop, not only on a single long request; preserve response text and final JSON structure independently from context carving.