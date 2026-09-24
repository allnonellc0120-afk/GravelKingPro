---
name: Stripe backfill stale customers
description: Missing customers from a previous Stripe account should be retained as deleted mirror rows and excluded from future backfills.
---

When stripe-replit-sync encounters `resource_missing` for a customer, mark the matching `stripe.customers` mirror row as `deleted` and log at info level. In the managed mirror, `deleted` is a generated projection, so update `_raw_data.deleted` instead. Continue surfacing unrelated backfill errors.

**Why:** Customer IDs are account-scoped, so a prior connected account can leave harmless foreign IDs in the mirror. Leaving them active causes the same startup warning on every boot, while swallowing every backfill error hides real failures.

**How to apply:** Parse and validate the missing customer ID from the Stripe error, update only that mirror row, and keep checkout's current-account customer self-healing behavior unchanged.