---
name: Play reviewer demo account
description: The reviewer login is a separate customer session and must be published before Play can use it.
---

The Play reviewer account is intentionally a customer-only identity: it receives the highest customer entitlement but must never receive developer/admin access. The API creates or repairs the account at startup in whichever database the deployment uses, while the login route creates a normal session cookie. Local verification does not prove the public deployment has the route or account until the project is published again.

**Why:** The public deployment and development environment use separate runtime/database state, so a newly added reviewer route can return 404 on production even when the local flow passes.

**How to apply:** After changing reviewer authentication or entitlement, typecheck and test locally, publish, then verify the public login endpoint and subscription status before giving credentials to Google Play.