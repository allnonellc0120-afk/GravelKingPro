---
name: Stripe wallet payment method domain
description: Apple/Google Pay in embedded checkout require a registered+validated Stripe Payment Method Domain; gravelkingpro.com is registered, and the live domain is .com not .it.com
---

Embedded Apple Pay / Google Pay (ExpressCheckoutElement) only render when the
domain is a registered, validated Stripe Payment Method Domain AND the Apple
association file serves 200 at `/.well-known/apple-developer-merchantid-domain-association`.

- gravelkingpro.com is registered (PMD id in docs/wallet-checkout-qa.md), apple_pay/google_pay active.
- The live domain is **gravelkingpro.com**; older domain references are stale.
- The Stripe account had only checkout.stripe.com registered by default; own-domain registration is a manual/API step, not automatic.

**Why:** wallets silently vanish (Stripe reports availablePaymentMethods false) if either the PMD or the association file breaks — no error shown to users.
**How to apply:** if wallet buttons are reported missing in prod, validate the PMD and curl the association file first. Wallet buttons can never be automated from headless Linux Chromium — use the manual QA script in docs/wallet-checkout-qa.md.

The Apple association payload is an opaque signed Stripe artifact, not a
hand-authored JSON file. The web production build must obtain Stripe's
canonical public payload and the live post-publish check must reject the SPA
HTML fallback even when it returns HTTP 200.

**Why:** manually transcribing or treating the payload as ordinary JSON can
silently invalidate Apple Pay domain verification.

**How to apply:** preserve the build-time canonical-asset guard and run the
wallet verifier immediately after each publish.
