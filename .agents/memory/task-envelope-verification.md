---
name: Task-envelope verification
description: Live audio contract checks must use real Replicate output and OS subprocess telemetry, with missing assets causing a hard failure.
---

Execution-contract verification is intentionally operator-run and fail-closed: it must resolve the source and RVC weights from the named GCS bucket via signed URLs, obtain a real Replicate prediction id/output, verify fresh admin settings, and validate a DB-backed admin session before reporting mastering telemetry.

**Why:** The workspace can be CPU-only and may not contain the contract's source/model assets; substituting attached renders, cached metadata, guessed buckets, or fabricated provider results would make the verification misleading.

**How to apply:** Keep provider conversion separate from the product's webhook path. Use subprocesses for normalization, MLK mastering, MP3 encoding, ffprobe, stat, sha256sum, and ebur128, and report their OS PIDs plus the real disk paths.