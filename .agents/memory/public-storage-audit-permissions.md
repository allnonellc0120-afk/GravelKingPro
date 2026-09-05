---
name: Public storage audit permissions
description: Managed object storage may deny deployment identities list/get access even when anonymous public URL checks remain possible.
---

# Public storage audits must separate permission errors from exposure results

When auditing historical public objects, a failed authenticated SDK list or
object-existence probe is inconclusive. Pair any managed-bucket permission
failure with anonymous HTTP checks of candidate public URLs, and inventory any
listable fallback bucket independently.

**Why:** The deployment identity can lack `storage.objects.list` and
`storage.objects.get` on the managed bucket, so treating those errors as
“empty” risks missing an exposed object.

**How to apply:** Report the permission limitation explicitly. Only delete a
confirmed public full take after an anonymous URL check succeeds and its
private counterpart has been verified.

The idempotent managed Object Storage setup does not repair an already
provisioned bucket's IAM policy. The configured owner-project service account
may also lack `storage.buckets.getIamPolicy`, so the deployment identity grant
must be repaired by the platform or bucket owner rather than by application
code.

**Why:** Re-running setup returned an already-provisioned result while direct
list and metadata probes continued to return 403.

**How to apply:** Keep inventory reads primary-only and prefix-scoped so a
fallback bucket cannot hide a managed-bucket permission regression.