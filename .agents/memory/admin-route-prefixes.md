---
name: Admin route prefixes
description: API routers mounted under /api must register route paths without repeating the /api prefix.
---

API routers mounted at `/api` must declare `/admin/...`, not `/api/admin/...`; repeating the prefix produces `/api/api/...`, causing the UI's expected admin endpoint to 404 before authorization runs.

**Why:** The label admin router had duplicated its mount prefix, which made an unauthorized request look like a missing route instead of returning the required 403.

**How to apply:** When adding or auditing API routes, check both the router declaration and the `app.use` mount before writing curl checks or client fetch paths.