---
name: GKA runtime boundary
description: The durable Morris Law Kernel V2/GKA parity contract for Python audio services and the Node DAW hot path
---

The authoritative Python boundary is `GKAdvantageCore` in `lib/gka_middleware.py`, bound at construction to the root `gka_spec.json` values: multiplier 0.75, slice size 2, seven subsystem partitions, and the statutory identity/hash. Python ingestion, FastAPI ffmpeg/Demucs work, and the MLK master worker must use that boundary for task lineage and partitioned audio processing.

**Why:** the Node API and browser DAW cannot import a Python module directly. The Node MLK fast path therefore preserves the same GKA constants and uses the same one-pass band graph, while Python remains the authoritative cross-service parity check.

**How to apply:** preserve the fixed DAW targets of -14 LUFS and -0.5 dBTP. Keep the studio mix carve and loudness normalization in one ffmpeg graph; the regression target is under 600ms for the short stereo fixture. Do not add mock or silent fallback processing to satisfy parity.