---
name: Funnel + trial integrity
description: Rules keeping the GravelKing subscription funnel honest — trial consumption timing, Play fail-closed, eligibility-aware copy, windowed activation metrics
---

# Funnel + trial integrity

- **Trials are consumed ONLY on webhook completion** (`checkout.session.completed`, subscription mode), never at Checkout creation. An open/abandoned session is not a trial.
  - **Why:** marking `trialUsed` at session creation burned real prospects' only trial when they abandoned checkout (22 of 24 sessions expired unpaid).
- **Checkout creation must block trial farming**: list customer subscriptions (reject 409 if any active/trialing/past_due/unpaid — also prevents double-billing) and expire all OPEN checkout sessions before creating a new one (each open session created pre-consumption carries its own free trial).
- **Play environment must fail closed**: track `playEnvDetected` (Digital Goods service exists) separately from `playMode` (full catalog loaded). If detected but catalog failed → block Stripe checkout with a toast, never fall back. Auto-resume-after-login skips any detected Play env.
  - **Why:** Play policy forbids Stripe for digital subs in the Play app; a partial catalog looked like "web mode".
- **Trial copy must match server truth**: `/api/subscription/status` returns `trialEligible` (`!trialUsed`); pricing labels/pills swap to "Get Pro Plus"/"trial used" wording when false. Never promise a trial the server won't grant (server computes trial days by price interval: month=7, week=3, gated on `!trialUsed`).
- **Funnel metrics are windowed and event-based**: admin funnel ends at `subscription_activated` (webhook-recorded) within the window; all-time paying subs shown separately as a footnote. Activation tracking began 2026-08-07 — earlier periods legitimately show 0.
- **Internal traffic is flagged at record time, not query time**: analytics beacons stamp `metadata.internal="1"` when the request carries the admin cookie or originates from localhost / the Replit dev-preview domain; the admin summary's "external visitors" filters on that flag. Don't reintroduce SQL-side path/referrer heuristics — they misclassify direct external traffic.
- **The artist plan is publicly named "GravelKing Studio"** (badge "Artist Plan"); "Pro Plus" is retired in all public copy. Homepage promises only what checkout delivers: trial at checkout, card required, one per account — never a no-card trial or an emailed trial link.
- **How to apply:** any new checkout path, plan, or billing surface must preserve all rules above; e2e = home CTA → /pricing?plan=X&utm → login returnTo keeps plan+utm → auto-resume (web only) → Stripe.
