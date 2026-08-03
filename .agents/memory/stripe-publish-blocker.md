---
name: Stripe publish blocker
description: What must be cleared before Replit publishing will accept the managed live Stripe connection
---

The project has a healthy, added Replit Stripe connection and the API successfully runs migrations, configures a managed webhook, and completes backfill. However, a `STRIPE_SECRET_KEY` secret still exists in the workspace environments. The API's production-safe code now prefers the managed connection and only permits that raw key as a development fallback, but Replit's publish preflight can still reject the project while the secret exists and label the app as using Stripe sandbox setup.

**Why:** `deleteEnvVars()` only removes ordinary environment variables; it does not delete secrets. A previous cleanup attempt returned success-shaped results without removing the secret, and the restarted development API logged `Using local development STRIPE_SECRET_KEY fallback`, proving the secret remains.

**How to apply:** Before the next publish, remove `STRIPE_SECRET_KEY` from the Replit Secrets UI for shared/development/production as applicable. Then restart the API and confirm logs show managed Stripe connection behavior without the local fallback message. Do not expose the key. The project should then be republished so the current reviewer-auth and Help-center changes reach production.