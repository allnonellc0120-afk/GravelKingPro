---
name: Credit pricing rules
description: Current GravelKing credit economics and subscription reset behavior
---

Generation costs 20 credits; MP3 exports cost 50 credits and WAV exports cost 100 credits; certification is free and unlimited for signed-in creators. Pro has 800 credits per paid billing period; King Pro has 2,500 credits per paid billing period. Subscription renewal replaces the wallet with the new allowance; unused credits do not roll over.

One-time credit packs keep base prices of 500/$10, 1,250/$20, and 2,500/$30, with a separate promotional bonus of 250, 500, and 1,000 credits respectively; the current totals are 750, 1,750, and 3,500.

**Why:** Export pricing must match the explicit download choices shown to creators. The old combined 75-credit master/download rule hid format-specific value and caused UI/backend pricing drift.

**How to apply:** Keep UI labels, server spend constants, transaction kinds, subscription wallet resets, and Play/web copy aligned. Charge only after the requested output is available; open the credit top-up dialog on insufficient balance.