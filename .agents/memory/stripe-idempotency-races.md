---
name: Stripe idempotency races
description: Stripe idempotency keys still need bounded retry during concurrent creates
---

**Rule:** A stable Stripe idempotency key prevents duplicate objects, but a concurrent identical request can receive `idempotency_key_in_use` while the first request is still running. Retry that specific error with bounded exponential backoff, and protect database relinking with compare-and-swap plus reread.

**Why:** Search-then-create and customer remint flows can run concurrently during deployment boots or checkout requests; treating the transient conflict as a permanent error turns a safe idempotency design into a failed checkout or incomplete catalog seed.

**How to apply:** Use the retry for product, price, and customer creates. Never replace a lost conditional database update with an unconditional write.