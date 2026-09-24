---
name: Browser audio regression fixtures
description: Sample-rate behavior to account for when testing browser-native audio export
---

Browser `AudioContext` decoding may resample an uploaded WAV to the browser's
default context rate instead of preserving the fixture's encoded rate. In the
browser environment, decoding and offline export may use different rates.

**Why:** frequency-response analysis against the encoded fixture rate can report
false failures (or miss real ones) when the browser silently resamples.

**How to apply:** browser audio export tests should use the actual output header
rate for their deterministic fixture and assert the output sample rate,
duration, and frame count together.
Decode PCM using the header's bit depth and frame stride, not a historical
16-bit assumption. Test servers launched through package managers must clean
up their whole owned process group: killing only the wrapper can leave pipes
open after assertions pass.