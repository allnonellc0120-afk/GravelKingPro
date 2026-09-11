---
name: GravelKing RVC weights
description: Durable location and storage behavior for the trained GravelKing v2 voice model.
---

The GravelKing v2 RVC model has completed 150-epoch cloud GPU training. Its `.pth` and `.index` artifacts are stored under the stable `models/gravelking_v2` keys in backend-aware Object Storage.

**Why:** The Replit-managed bucket rejected `storage.objects.create` for both available service identities, so the completed artifacts had to be preserved in the configured owner-project fallback bucket rather than lost or retrained.

**How to apply:** Resolve model files through the primary-then-fallback Object Storage helpers and generate short-lived signed URLs at inference time. If managed-bucket IAM is repaired, copy the same keys into the managed bucket without retraining.