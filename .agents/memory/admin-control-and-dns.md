---
name: Admin control and DNS operations
description: Admin runtime settings are persisted in admin_settings; GoDaddy DNS mutations require a valid API credential and must preserve record-type siblings.
---

Admin runtime controls should be validated server-side, persisted in `admin_settings`, and loaded before generation requests so opening the admin UI is not required to activate saved defaults.

**Why:** The admin surface controls production behavior, while GoDaddy record updates can replace an entire name/type set; an invalid GoDaddy credential must fail closed instead of risking unrelated SPF, Replit, or verification records.

**How to apply:** Keep provider sends confirmation-gated, keep DNS inspection separate from mutation, and use the managed SendGrid connector rather than storing API keys in application code.