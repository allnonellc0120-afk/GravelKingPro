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