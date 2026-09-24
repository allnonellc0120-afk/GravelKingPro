---
name: drizzle-kit push non-interactive
description: drizzle-kit push hangs/fails on schema conflict prompts in this workspace
---
drizzle-kit push and push --force both fail non-interactively (TTY prompt on enum/table conflicts).

**Why:** dev DB drifted (e.g. `jobs` table for masterJobsTable was missing), and the prompt cannot be answered from a shell tool.

**How to apply:** apply additive DDL through executeSql (CREATE TYPE/TABLE IF NOT EXISTS + indexes) instead of retrying push; Publish still diffs dev → prod.
