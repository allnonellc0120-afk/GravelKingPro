---
name: Referral/promoter program
description: How the creator commission system attributes and accrues — invariants to preserve
---

Attribution is server-side only: tracked-link clicks set an httpOnly `gk_ref` cookie; at checkout creation the server validates the promoter (approved, not self) and writes first-touch attribution to the DB. Commission accrues ONLY on the verified `invoice.paid` webhook with `amount_paid > 0` (trials skip naturally), idempotent per Stripe invoice id; `charge.refunded` reverses it.

**Why:** client-claimed referral codes are trivially forged; trial/refund accrual would pay promoters for revenue that never landed.

**How to apply:** never accrue commission from client input or checkout success redirects; any new billing path (e.g. Play Billing) needs its own server-verified accrual hook. Promoter must be `approved` at both attribution and accrual time. Payouts are manual (admin marks paid) — no automated transfer exists.
