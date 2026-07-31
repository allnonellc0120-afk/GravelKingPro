---
name: Paid upload authorization
description: Security ordering and integrity rules for public file uploads unlocked by payment.
---

Authorize the paid order and its separate fulfillment token before invoking any multipart parser or accepting file bytes. Store uploads in fixed server-generated per-order slots, validate the actual bytes, and lock the order after final submission.

**Why:** Validating only after multipart parsing still permits unauthenticated network and disk exhaustion. Client-declared sizes, types, paths, and slot numbers cannot enforce storage limits or fulfillment integrity.

**How to apply:** For any payment-gated upload, put payment/token middleware before Multer or equivalent; enforce byte limits at ingestion; verify content server-side; bind paths to the order; require unique expected slots; rate-limit attempts; reject post-submission mutation.