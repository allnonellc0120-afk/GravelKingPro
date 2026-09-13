---
name: JAX token telemetry
description: The JAX token savings telemetry contract and performance boundary
---

JAX token telemetry uses a native zero-dependency character-ratio estimator and a bounded in-process ledger. Each record separates raw context plus output budget from actual prompt and completion text, then derives suppressed tokens and suppression percentage. The tracker must measure only its own bookkeeping, not provider/model latency, and must not store prompt or completion contents.

**Why:** model calls are the expensive path; telemetry must be safe to attach to JSON and SSE responses without adding measurable request latency or leaking artist content.

**How to apply:** use the request tracker around JAX generation, classify remix prompts as `jax_remix`, preserve the five-field arithmetic (`raw - actual`, clamped at zero), and keep the simulation guard at `<1ms` per record.