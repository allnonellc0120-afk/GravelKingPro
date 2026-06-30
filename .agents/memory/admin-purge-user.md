---
name: Admin purge-user endpoint
description: POST /api/admin/purge-user hard-deletes a user and all their data; useful for banning/removing users from production.
---

## Rule
To remove a user and all their data from the database (hard delete), call `POST /api/admin/purge-user` with `{ email }` body and admin auth. The endpoint deletes in FK-safe order: process_runs → tracks (via submittedByUserId) → users row.

**Why:** SQL FK constraints prevent deleting a user row if process_runs or tracks still reference it. The endpoint handles the cascade order.

## How to apply
- File: `artifacts/api-server/src/routes/adminAuth.ts` (near end of file)
- Auth: requires admin session cookie (login at /admin first) OR `x-admin-key` header
- Body: `{ "email": "user@example.com" }`
- Response: `{ ok: true, deleted: true, userId, email, tracksRemoved }` or `{ deleted: false }` if not found
- Drizzle raw SQL: uses `sql` tagged template from drizzle-orm (dynamic import inside handler)

## Pattern for prod cleanup after a ban
1. Deploy to push the code
2. POST `https://<prod-domain>/api/admin/login` with `{ adminKey }` to get session cookie (or use x-admin-key header)
3. POST `https://<prod-domain>/api/admin/purge-user` with `{ email }` and x-admin-key header
4. Verify response shows `deleted: true` and expected `tracksRemoved` count
