---
name: Stripe Payment Element config
description: The managed Stripe connector may expose its browser publishable key under a provider-varying settings field.
---

The server-side Stripe connector reader should discover any `pk_test_` or `pk_live_` value in the returned settings object rather than assuming one fixed property name.

**Why:** The connector returned the secret key but not the initially assumed publishable-key property; hardcoding one field made the embedded checkout unusable even though Stripe itself was connected.

**How to apply:** Keep publishable-key discovery server-side and return only the publishable key from a small browser configuration endpoint; never expose connector secrets.