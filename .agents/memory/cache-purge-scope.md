---
name: Cache purge scope
description: Build-cache cleanup must not traverse installed dependency trees.
---

When purging project build output, exclude `node_modules`; package distributions also use `dist` directories, and deleting them breaks otherwise-installed dependencies until a forced reinstall restores them.

**Why:** A broad recursive `dist` purge removed pnpm package contents and caused Vite and API builds to fail before source validation.

**How to apply:** Limit cleanup to known artifact output directories and `.vite`/`.cache` locations outside `node_modules`; if the dependency tree is damaged, use a forced frozen-lockfile reinstall before rebuilding.