---
name: Durable mastering jobs
description: Durable status and output storage for mastering, plus the current boundary before true detached workers.
---

The mastering lifecycle must persist job status and finalized audio outside React state: Postgres tracks ownership/progress/status and private object storage holds the output. Browser pages should retain the active job ID and rehydrate by polling.

**Why:** Mobile route changes, background tabs, and tablet sleep can discard component state and blob URLs even when the server has completed the work.

**How to apply:** Preserve the synchronous response for legacy callers until entitlement, credit, certification, and durable input handling are moved into a detached worker. Do not claim a 202/background-worker contract until the uploaded input is durable and the worker owns those checks; stale in-process jobs should fail clearly after a server restart rather than poll forever.