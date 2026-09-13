---
name: JAX token telemetry
description: The JAX token savings telemetry contract and performance boundary
---

JAX token telemetry uses a native zero-dependency character-ratio estimator and a bounded in-process ledger. Each record separates raw context plus output budget from actual prompt and completion text, then derives suppressed tokens and suppression percentage. The tracker must measure only its own bookkeeping, not provider/model latency, and must not store prompt or completion contents.

**Why:** model calls are the expensive path; telemetry must be safe to attach to JSON and SSE responses without adding measurable request latency or leaking artist content.

**How to apply:** use the request tracker around JAX generation, classify remix prompts as `jax_remix`, preserve the five-field arithmetic (`raw - actual`, clamped at zero), and keep the simulation guard at `<1ms` per record.

For multi-turn context suppression, the raw baseline must retain the complete conversation, while Turn 2+ optimized context keeps deduplicated system/developer instructions plus the active turn; historical assistant turns and duplicate whitespace are removed before provider dispatch.

**Why:** retaining the full prior conversation made early turns show zero suppression and reduced the audited four-turn benchmark below target.

**How to apply:** validate cumulative suppression on a sequential four-turn loop, not only on a single long request; preserve response text and final JSON structure independently from context carving.