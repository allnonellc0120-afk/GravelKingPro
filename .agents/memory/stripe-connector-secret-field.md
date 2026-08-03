---
name: Stripe connector secret field rename
description: Managed Stripe connection lookup broke because the connector schema renamed the credential field.
---

The Replit Stripe connector's `/api/v2/connection` response now ships the API key under `settings.secret` (alongside `account_id`, `publishable`, `mcp`, `claim_url`) instead of the old `settings.secret_key`, and no longer includes `webhook_secret` in settings.

**Why:** Both `artifacts/api-server/src/stripeClient.ts` and `scripts/src/stripeClient.ts` only read `secret_key`, so every runtime lookup "failed" even though the connection was healthy — startup webhook/backfill and the price-parity test crashed with "Stripe managed connection is unavailable".

**How to apply:** Credential readers must accept `secret_key ?? secret` and reject `pk_*` publishable keys. If Stripe credential lookups fail while the integration shows healthy, dump the connector item's `settings` keys first — the schema drifts. Watch for "Track purchase webhook handler failed: StripeSignatureVerificationError" — the connector no longer supplies a webhook_secret, so any custom constructEvent verification against it can mismatch the StripeSync-managed endpoint secret.
