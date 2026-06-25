---
name: Lifetime / owner full access
description: How owner accounts get full lifetime access + admin on sign-in, and the OIDC-sub vs legacy-row gotchas behind it
---

# Owner / lifetime full access

## How owner accounts are unlocked
Owner accounts get full access via an **email allowlist in `auth.ts` `upsertUser` (LIFETIME_GRANTS)** that forces `isPro=true` + `subscriptionTier='node_auditor'` (and `isDeveloper` for the admin email) on every OIDC sign-in. `node_auditor` is the top tier (superset of all features); `isDeveloper` additionally unlocks admin/label tooling.

**Why:** dev and prod use *separate* Postgres DBs, so a one-off DB UPDATE only fixes the DB it runs against. Keying the grant on the **verified OIDC email** (stable, unlike the sub) makes it self-apply on the next sign-in in whichever DB the server runs against — no manual prod grant needed.
**How to apply:** add the email to LIFETIME_GRANTS → republish → have the user sign out/in. Non-allowlisted users' `isPro`/tier are never touched (Stripe stays authoritative for them).

## Entitlement is keyed by the returned row id, NOT the OIDC sub
`/callback` + mobile token-exchange store `upsertUser()`'s returned `user.id` in the session; `authMiddleware` restores it as `req.user.id`; `resolveTier()` and `isDeveloperAuthenticated()` look up `usersTable.id == req.user.id`. So whatever row `upsertUser` returns IS the entitlement row.

## Gotcha: grant-access UUID row vs OIDC sub + UNIQUE(email)
`POST /api/admin/grant-access` with only an email inserts a row with a `gen_random_uuid()` id. When that same person later signs in via OIDC (different numeric sub), a naive `insert(target:id).onConflictDoUpdate` throws on the **UNIQUE(email)** constraint (or creates a second, unentitled row).
**Fix (in code):** `upsertUser` reconciles — update by sub if a sub-row exists, else **adopt and update the existing email-row** (returning its id), else insert keyed by sub.

## Legacy claim-link path (still present)
`GET /api/activate?t=<uuid>` lets a pre-registered `is_pro` row be claimed by the current `gk_session` (anonymous/Stripe path), validated server-side (`is_pro` must be true). Secondary to the allowlist for OIDC users.
