---
name: API test suite serialization
description: Why the api-server test script runs under flock, and the legacy lyric-owner cookie rule
---

**Rule 1:** `pnpm --filter @workspace/api-server run test` is wrapped in `flock /tmp/gk-apiserver-test.lock -c '...'`.
**Why:** the studio-audio workflow and task validation both run the same script; two concurrent runs race on the shared `dist-test/` build dir (`rm -rf` mid-run → truncated/missing `.mjs` bundles, "Unexpected end of input" / MODULE_NOT_FOUND flakes).
**How to apply:** keep the flock wrapper when editing the test script; new test files go into build.test.mjs entryPoints + the same locked chain.

**Rule 2:** lyric project ownership — the `gk_session` cookie path in `isProjectOwner` must be denied when the stored `sessionId` equals an existing users.id (legacy rows keyed to user principals). User ids are public/stable, not bearer secrets; only authenticated `req.dbUser` may own those rows.
**Why:** otherwise forged `gk_session=<userId>` is an IDOR on legacy projects (caught by completion review, regression test: lyric-owner-auth.test.ts).

**Note:** benchmark.test's "/tmp gk_bench_* leftovers" check can flake under heavy parallel load; passes in isolation.
