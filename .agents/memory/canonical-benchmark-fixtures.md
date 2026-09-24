---
name: Canonical benchmark fixtures
description: Audio benchmark fixture requirements at the Python MLK boundary
---

Benchmark fixtures that invoke the canonical Python MLK worker must be generated as 48 kHz, 24-bit PCM WAV before the worker runs.

**Why:** The worker intentionally rejects non-canonical sample rates, so older 44.1 kHz benchmark fixtures fail even when the DSP itself is healthy.

**How to apply:** Keep synthetic benchmark generators aligned with the production boundary and assert fixture format as part of benchmark verification.