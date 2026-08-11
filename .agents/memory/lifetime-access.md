---
name: Lifetime / owner full access
description: How owner accounts get full lifetime access + admin on sign-in, and the OIDC-sub vs legacy-row gotchas behind it
---

# Owner / lifetime full access

## How owner accounts are unlocked
Owner accounts get full access via an **email allowlist (LIFETIME_GRANTS), now in `middlewares/authMiddleware.ts` after the Clerk migration** that forces `isPro=true` + `subscriptionTier='node_auditor'` (and `isDeveloper` for the admin email) on every authenticated request (JIT provisioning). `node_auditor` is the top tier (superset of all features); `isDeveloper` additionally unlocks admin/label tooling.

**Why:** dev and prod use *separate* Postgres DBs, so a one-off DB UPDATE only fixes the DB it runs against. Keying the grant on the **verified OIDC email** (stable, unlike the sub) makes it self-apply on the next sign-in in whichever DB the server runs against — no manual prod grant needed.
**How to apply:** add the email to LIFETIME_GRANTS → republish → have the user sign out/in. Non-allowlisted users' `isPro`/tier are never touched (Stripe stays authoritative for them).

## Entitlement is keyed by the provisioned row, NOT the raw claim
`loadAuthUser` resolves `sessionClaims.userId` → `req.dbUser` via jitProvisionUser; `resolveTier()` and `isDeveloperAuthenticated()` read `req.dbUser` directly. So whatever row jitProvisionUser returns IS the entitlement row.

## Gotcha: grant-access UUID row vs bridge id + UNIQUE(email)
`POST /api/admin/grant-access` with only an email inserts a row with a `gen_random_uuid()` id. When that same person later signs in (bridge id = Clerk sessionClaims.userId, which never matches the UUID), a naive insert throws on the **UNIQUE(email)** constraint (or creates a second, unentitled row).
**Fix (in code):** `jitProvisionUser` reconciles — use the bridge-id row if it exists, else **adopt the existing email-row case-insensitively** (keeping its id so FKs and entitlement stay intact), else insert keyed by the bridge id with a conflict-safe re-resolve. Guarded by the clerk-jit-provision test in the api-server suite.

## Legacy claim-link path (still present)
`GET /api/activate?t=<uuid>` lets a pre-registered `is_pro` row be claimed by the current `gk_session` (anonymous/Stripe path), validated server-side (`is_pro` must be true). Secondary to the allowlist for OIDC users.
