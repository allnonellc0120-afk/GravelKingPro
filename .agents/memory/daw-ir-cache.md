---
name: DAW IR cache
description: makeIR() is synchronous and blocks 5–20ms at large reverb sizes — requires memoization
---

**Rule:** `makeIR()` in useDAW.ts must use a module-level `_irCache` keyed by `${sampleRate}:${sizePct}:${dampPct}`. AudioBuffer objects are safe to share across BaseAudioContext instances with the same sample rate.

**Why:** Audit showed makeIR() at 75% size averages 7ms, p99 = 20ms — well above the 5ms threshold. It runs on every playback restart (buildAndStart). The fix reduces repeated calls to ~0µs (Map lookup).

**How to apply:** If reverb plugin count or playback restarts increase, check that size/damp values are integer-snapped before forming the cache key to avoid cache misses from float drift.
