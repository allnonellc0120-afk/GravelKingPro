---
name: Google Play Billing architecture
description: Dual payment rails (Stripe web / Play Billing in TWA), verification invariants, Play API + bubblewrap quirks hit while building it
---

# Google Play Billing (GravelKing Pro)

## Invariants (don't regress)
- Stripe on web; Play Billing inside the Play-installed TWA (Play policy — opening Stripe checkout in the app risks rejection). The signed-in account is the cross-platform unlock; either rail entitles the same user.
- Google is source of truth: client sends ONLY purchaseToken; server verifies via subscriptionsv2. Entitled = expiry in future + state in {active, grace, canceled}.
- Token claim must be atomic: insert with onConflictDoNothing on the unique token index inside a transaction — same user idempotent, different user 409. Retire a linkedPurchaseToken predecessor only when owned by the SAME user.
- Transient Google outages must not revoke: bounded fail-open (~48h past last confirmed expiry) and the verify-attempt throttle is recorded on FAILURE too; Play-path errors never block Stripe evaluation. Renewals are lazy re-verifies (no RTDN pipeline).
- Acknowledge within 3 days (else Google auto-refunds); "already acknowledged" 400 = success; acknowledge only after the claim is secured.
- Client: play mode only when Digital Goods API exists AND getDetails returns ALL plan SKUs (partial catalog → stay on Stripe); trial copy hidden in play mode (no Play trial offers configured).

## Play Developer API quirks
**Why:** these cost real debugging time; the error messages are the only documentation.
- Subscription create requires the CURRENT regionsVersion; stale versions fail with per-region currency mismatches (e.g. Bulgaria's BGN→EUR flip). Sending an invalid version makes the error reveal the latest value.
- Weekly base plans cap gracePeriodDuration at P7D.
- The existing GCP service account can manage monetization AND upload bundles — no extra Console grants were needed.

## bubblewrap Play Billing build
**Why:** each missing flag fails with a different confusing error.
**How to apply:** twa-manifest.json needs playBilling feature + alphaDependencies enabled + enableNotifications:true (update aborts without it) + minSdkVersion 23 (billing lib floor; the default 21 fails manifest merge). After update, verify PaymentActivity/PaymentService landed in the generated AndroidManifest.
- Device purchase testing needs the PRODUCTION site republished (the TWA loads the prod domain, not the workspace) and license testers configured in Play Console.
