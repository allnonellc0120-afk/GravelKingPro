---
name: Stripe checkout auth + trial pattern
description: Checkout requires OIDC auth; trials tracked per account via trialUsed column
---

**Rule:** `POST /api/checkout` now requires OIDC authentication (`req.isAuthenticated()`). Anonymous requests get HTTP 401 `{ authRequired: true }`. The frontend redirects to `/api/auth/login?return_to=/pricing` on that response (or preemptively if `isSignedIn === false`).

**Trial logic:** Monthly = 7-day trial, Weekly = 3-day trial. Both are gated by `users.trial_used` (boolean, default false). The trial is marked used at checkout-session creation — not at subscription confirmation — so abandoned checkouts still consume the trial. This prevents re-claiming across plans.

**Subscription status:** Still dual-path: OIDC users resolved via `req.user.id` (checked first); legacy gk_session cookie as fallback for any grandfathered anonymous users.

**Why:** Subscription trials are an account-level benefit. Without auth, a user could claim unlimited trials by clearing cookies. The trialUsed column enforces one-trial-ever per verified identity.

**How to apply:** Any new subscription entrypoint must check `req.isAuthenticated()` before proceeding. The Stripe customer is created/retrieved from the authenticated user's DB row (`req.user.id`), not from a cookie-generated session.

**Pricing (as of July 2026):** $9.99/week (3-day trial), $24.99/month (7-day trial), $499/month Node Auditor.
