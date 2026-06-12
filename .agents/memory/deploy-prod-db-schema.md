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
