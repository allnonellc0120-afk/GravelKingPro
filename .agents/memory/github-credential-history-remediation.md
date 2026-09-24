---
name: GitHub credential history remediation
description: Durable checks for removing exposed credentials from all published GitHub refs
---

Revoke the credential, rewrite every published branch and tag that can reach the secret-bearing commit, and verify each ref plus GitHub secret-scanning state afterward. Resolving an alert alone does not remove the credential from non-default refs.

**Why:** A non-default branch and its audit tag can retain the original secret-bearing commit after the default branch is cleaned, leaving GitHub secret scanning open even when the working tree is clean.

**How to apply:** Enumerate remote heads and tags, check path/key reachability on each, force-update only the affected refs, then confirm zero open alerts. When using `git filter-branch`, exclude its temporary `refs/original` backup refs from the post-rewrite verification.