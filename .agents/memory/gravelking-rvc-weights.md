---
name: GravelKing RVC weights
description: Durable location and storage behavior for the trained GravelKing v2 voice model.
---

The GravelKing v2 RVC model has completed 150-epoch cloud GPU training. Its `.pth`, `.index`, and in-memory-packaged `.zip` artifacts are stored under the stable `models/gravelking_v2` keys in backend-aware Object Storage.

**Why:** The Replit-managed bucket rejected `storage.objects.create` for both available service identities, so the completed artifacts had to be preserved in the configured owner-project fallback bucket rather than lost or retrained. Replicate's RVC container requires a ZIP and mishandles native GCS signed-query filenames.

**How to apply:** Resolve model files through the primary-then-fallback Object Storage helpers, package root-level `.pth` and `.index` entries in memory, and use the short-lived clean-path signed stream for Replicate. If managed-bucket IAM is repaired, copy the same keys into the managed bucket without retraining.