---
name: Credit pricing rules
description: Current GravelKing credit economics and subscription reset behavior
---

Generation costs 20 credits; a completed master plus download costs 75 credits; certification is free and unlimited for signed-in creators. Pro is $6.99/week with 800 credits per billing period; King Pro is $24.99/month with 2,500 credits. Subscription renewal replaces the wallet with the new allowance; unused credits do not roll over.

One-time credit packs keep base prices of 500/$10, 1,250/$20, and 2,500/$30, with a separate promotional bonus of 250, 500, and 1,000 credits respectively; the current totals are 750, 1,750, and 3,500.

**Why:** The previous catalog duplicated paid entitlements, used incorrect monthly/weekly pricing, and made certification a paid friction point before users trusted the provenance workflow.

**How to apply:** Keep Stripe seed data, UI copy, server spend constants, webhook renewal logic, and Play catalog aligned with these values. Treat master+download as one wallet action.