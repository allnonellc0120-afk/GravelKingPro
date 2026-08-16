---
name: Startup-created tables get dropped on Publish
description: Any table created by raw startup SQL must also exist in the Drizzle schema or Publish will DROP it in production.
---

Publish diffs the **Drizzle schema (as pushed to the dev DB)** against production. A table created only by raw startup SQL (e.g. `CREATE TABLE IF NOT EXISTS` in server bootstrap) is invisible to that schema, so the publish diff emits `DROP TABLE ... CASCADE` for it — silently deleting its production data.

**Why:** `sitemap_submission_log` (created in API startup) showed up as a DROP with live rows in the prepublish diff (Aug 2026).

**How to apply:**
- Every operational/bookkeeping table the server creates at startup must also be defined in `lib/db/src/schema/` and exported from the schema index.
- After adding it, run the dev push (`pnpm --filter @workspace/db run push-force`). Drizzle prompts "created or renamed?" — pick **create table**; the prompt needs a PTY (use a small Python `pty.fork` driver; plain shell and `script` time out).
- Always run `explainSchemaDiff()` before declaring republish-ready and require `tablesToRemove` to be empty unless the drop is explicitly intended.
