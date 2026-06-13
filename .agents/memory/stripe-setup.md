---
name: Stripe + stripe-replit-sync setup
description: Key constraints and initialization order for Stripe in this monorepo
---

**Rule:** `stripe` and `stripe-replit-sync` packages must stay at the workspace root (`pnpm add -w`). Do NOT add them to any workspace package — pnpm hoisting makes them accessible.

**Rule:** Webhook route must be registered in `app.ts` BEFORE `express.json()`. If the order is reversed, the Buffer body gets parsed and Stripe's signature verification throws.

**Initialization order in index.ts** (must not deviate):
1. `runMigrations({ databaseUrl })` — creates stripe.* schema tables (idempotent)
2. `getStripeSync()` — needs migrations to exist first
3. `stripeSync.findOrCreateManagedWebhook(url)` — auto-configures webhook
4. `stripeSync.syncBackfill()` — runs in background, fire-and-forget

**Seeding products:** Run `pnpm --filter @workspace/scripts run seed-products` once after connecting Stripe. Script is idempotent (checks for existing products by name). Products sync to `stripe.products`/`stripe.prices` via webhook — never INSERT directly.

**Why:** stripe-replit-sync creates and owns the `stripe.*` schema. Creating/modifying those tables manually corrupts the sync state.

**Gotcha — raw STRIPE_SECRET_KEY shadows the Replit integration:** if a `STRIPE_SECRET_KEY` env var/secret is set, startup logs "Using raw STRIPE_SECRET_KEY — skipping managed webhook setup" and SKIPS both `findOrCreateManagedWebhook` and `syncBackfill`. Result: the `stripe.*` schema exists but stays EMPTY (no mirror tables created), so `getUserSubscriptionStatus` (which JOINs `stripe.subscriptions/subscription_items/prices`) throws → `GET /api/subscription/status` returns 500 for any user with a `stripeCustomerId`, and a real checkout never activates a subscription (gk_session path can't unlock). To use the managed webhook/backfill, the raw `STRIPE_SECRET_KEY` must NOT be set — rely on the Replit Stripe integration's `getUncachableStripeClient` instead.
**Why:** checkout-session creation works either way (calls Stripe API directly), so the bug is invisible until you try to read subscription status or unlock a paid feature. The configured key in this project is a LIVE key (checkout URLs are `cs_live_...`), so a real payment in tests would charge a real card — never complete checkout in automated tests.
