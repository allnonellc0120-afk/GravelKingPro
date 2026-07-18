---
name: Prod DB schema migrates on Publish (not manually)
description: Replit's Publish flow auto-diffs dev→prod schema and applies it; never manually migrate prod.
---

# Production DB schema is applied by the Publish flow

Replit applies schema changes to production **automatically during Publish**. The
publish flow introspects the dev and prod databases, computes a SQL diff,
surfaces any renames for user confirmation in the Publish UI, and applies the
diff to the production database as part of publishing.

**Why:** This is the only supported path. Production is read-only to the agent
(`executeSql({ environment: "production" })` allows SELECT only; DDL fails by
design). Manual migration is both blocked and unnecessary.

**How to apply:** To get a dev schema change (e.g. a new `analytics_events`
table) live: (1) put it in the Drizzle schema source of truth, (2) apply to dev
with `pnpm --filter @workspace/db run push`, (3) verify the feature in dev,
(4) tell the user to **re-publish** (warn them they may see a confirmation
prompt for renames/destructive alters). NEVER run DDL against prod, write a
migrate-prod script, add db:push to a deploy/build command, or add startup-time
`CREATE TABLE IF NOT EXISTS` to self-heal prod. If prod is missing a table/
column, the fix is always: re-publish.

# Schema migrates, but DATA does not — seed prod via a deployed write endpoint

Publish carries the **schema** dev→prod, but **not the rows**. Prod starts with
empty tables. `executeSql({ environment: "production" })` is SELECT-only, so you
cannot INSERT seed data directly.

**Why:** Prod is read-only to the agent; the only thing with write access to the
prod DB is the deployed app itself.

**How to apply:** Ship an admin-gated POST endpoint (auth via `x-admin-key`
header matching the `ADMIN_KEY` secret — same value in dev and prod), publish it,
then call it once with curl: `curl -X POST <prod>/api/admin/.../seed -H
"x-admin-key: $ADMIN_KEY"` (reference the secret from the shell env; never print
it). Test gotcha: a POST-only route returns 404 to a **GET** — always test
route existence with the correct method before concluding "old code is running".

# Drizzle schema drift: columns added in code but never pushed to the dev DB

Adding columns to the Drizzle schema source without running `pnpm --filter
@workspace/db run push` breaks BOTH environments at runtime: every generated
INSERT names the new columns, Postgres rejects it ("column does not exist"),
and the route 500s — dev immediately, and prod too because Publish diffs the
**dev DB** (not the code) against prod, so the columns never reach prod either.

**Why:** this took down the Mastering tool end-to-end — audio processing
succeeded, then the final cert INSERT failed, so users got a 500 after full
processing. TypeScript compiles fine (the code matches the schema source), so
nothing catches it until runtime.

**How to apply:** whenever a `tool_errors` row or a 500 shows a Drizzle
"Failed query: insert into ..." message, immediately diff the named columns
against `information_schema.columns` in BOTH envs. After editing any file in
`lib/db/src/schema/`, apply it to dev (drizzle push, or a targeted
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` matching the schema exactly), verify
the route end-to-end, then have the user re-publish to carry it to prod.
