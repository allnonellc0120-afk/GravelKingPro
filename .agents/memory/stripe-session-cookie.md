---
name: Stripe session-cookie pattern
description: How GravelKingPro tracks subscriptions without an auth system
---

The app has no login system. Subscriptions are tracked via a `gk_session` cookie (UUID).

**Rule:** On `POST /api/checkout`, if no cookie exists the backend generates a new UUID session ID, creates a user row, then sets `Set-Cookie: gk_session=<uuid>` in the response. The browser stores it and sends it on all subsequent `/api/subscription/status` requests.

**Why:** Stripe Checkout redirects the user away and back — the cookie persists across that redirect, so the returning user is recognized and their subscription is found via `users.session_id → users.stripe_customer_id → stripe.subscriptions`.

**How to apply:** Any new gated feature should call `GET /api/subscription/status` (reads cookie) to check `isPro`. The frontend context already does this on mount and exposes `isPro` + `refreshSubscription()`.
