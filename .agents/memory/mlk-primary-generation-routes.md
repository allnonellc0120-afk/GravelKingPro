---
name: MLK primary generation routes
description: Engine ownership for the public generation and remix route contract
---

The canonical client-facing generation and remix paths are `/api/tracks/generate` and `/api/tracks/remix`; both dispatch to the MLK/Vertex orchestration layer. The legacy `/api/mlk/v35/*` paths remain supported aliases. JAX/Replicate is a separate secondary path and must not be the default client driver.

**Why:** The product needs Google Cloud/MLK to carry normal generation compute and storage decisions, with JAX retained for explicit fallback or secondary workflows.

**How to apply:** New UI calls should use the `/api/tracks/*` paths. Preserve MLK’s GCP-backed generation and Object Storage persistence; never silently substitute stock JAX audio when a vocal conversion dependency fails.