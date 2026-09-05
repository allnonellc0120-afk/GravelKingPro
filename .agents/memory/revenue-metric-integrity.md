---
name: Revenue metric integrity
description: Rules for reporting truthful Stripe revenue and registration counts
---

Production revenue dashboards must count only live-mode Stripe objects. MRR includes active subscriptions only; trialing subscriptions remain a separate count. Revenue is successful live charges net of refunds.

**Why:** A test-mode trial was previously displayed as MRR even though no recurring live payment had been collected, making the dashboard materially misleading.

**How to apply:** Filter Stripe subscriptions and charges by `livemode`, exclude trials from MRR, subtract partial refunds, and label account records without emails as anonymous/partial sessions rather than registrations.