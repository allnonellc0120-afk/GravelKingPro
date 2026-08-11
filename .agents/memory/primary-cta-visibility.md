---
name: Primary tool CTAs must be visible on page load
description: Never gate a page's headline capability behind output/session state — users read absence as "the feature was removed"
---

The /songwriting song generator (MlkGenerateCard) was rendered inside the `hasOutput` (lyrics-exist) block. Users who saw it while lyrics were on screen came back to a fresh page, found it gone, and concluded the paid publish had removed the feature — a costly trust incident.

**Rule:** any capability a page is promoted for must render unconditionally on first load. Gate *actions* (disabled button, Pro hint, "generate lyrics first" copy) — never gate the *presence* of the tool. Same principle as the earlier entitlement-delay fix: access is enforced inside the card, not by hiding it.

**How to apply:** when adding or moving feature cards in gravelkingpro pages, check they are outside output-state and entitlement conditionals; verify with a fresh signed-out page load, not a mid-flow state.
