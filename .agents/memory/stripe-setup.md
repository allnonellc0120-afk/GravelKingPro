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
