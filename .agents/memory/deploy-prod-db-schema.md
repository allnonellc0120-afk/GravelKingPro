---
name: Prod DB schema not auto-migrated on deploy
description: New tables/columns must be applied to the production Postgres separately; publishing does not run drizzle push.
---

# Production DB schema is NOT migrated on publish

Publishing/deploying the app does **not** run `drizzle-kit push` against the
production database. `pnpm --filter @workspace/db run push` only targets the
**dev** `DATABASE_URL`. Production has its own separate database.

**Why:** dev and prod are isolated environments with different `DATABASE_URL`s.
A feature that adds a table (e.g. `analytics_events`) will typecheck, work in
dev, and deploy fine — but on production the new table won't exist, so inserts
silently fail (and any best-effort `.catch()` swallows the error), producing
zero data with no obvious symptom.

**How to apply:** Whenever a change adds/alters a table or column, before or
right after publishing, apply the schema to the production DB too. Use the
`database` skill (it supports `environment: "production"`) to create/alter the
table in prod. Confirm the table exists in prod before expecting the feature to
record data live.
