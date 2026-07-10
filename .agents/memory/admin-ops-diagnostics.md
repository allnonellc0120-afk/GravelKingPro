---
name: Admin Ops diagnostics pattern
description: Structured error logging, live activity monitor, maintenance kill switch, and cache purge conventions for GravelKingPro's admin tooling
---

GravelKingPro has a standing "Ops" admin panel (`/admin/ops`, gated by the same `AdminGate`/`gk_admin` cookie as other admin pages) built around four small, independent pieces:

- `logToolError(toolName, stage, err)` (`artifacts/api-server/src/lib/errorTracker.ts`) — best-effort DB write to `tool_errors`; never throws. Call it from every processing-route catch block alongside the existing `req.log.error`, not instead of it.
- `recordActivity(sessionId, toolLabel)` (`activityTracker.ts`) — in-memory only (5 min TTL), not persisted. Call at the top of a route handler once the session cookie is known.
- `isMaintenanceModeOn()` / `setMaintenanceMode()` (`middlewares/maintenanceMode.ts`) — backed by a generic `admin_settings` key/value table, 5s in-process cache. The middleware is mounted globally in `app.ts` right after `authMiddleware` and bypasses `/api/admin*` and `/api/healthz` so the toggle stays reachable and admins are never locked out. It uses the sync `isAdminAuthenticated()` check (no side effects), never `requireAdmin()` (which sends its own response) — mixing the two inside a blanket middleware would double-send responses.
- `purgeTempAudioCache()` (`cachePurge.ts`) — scoped strictly to `/tmp` files prefixed `gk_`/`gkp_`; never a bare wildcard delete, never touches the DB.

**Why:** these were added under a strict "targeted edits only, log exact file/lines" patching protocol requested by the user — new tools/routes should follow the same call pattern (activity + error tracking) rather than inventing a new mechanism, and any new admin toggle should reuse the `admin_settings` table rather than a bespoke flag.

**How to apply:** when adding a new user-facing processing route, add one `recordActivity()` call near the top and one `logToolError()` call per catch block, matching the existing lyrics/audio/master routes. When adding a new admin-only endpoint, gate it with `if (!await requireAdmin(req, res)) return;` (matches existing adminAuth.ts routes) — don't use `isAdminAuthenticated` directly in a route handler since it won't send an error response on failure.
