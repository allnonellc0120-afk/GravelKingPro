---
name: Replicate poll timeout → DSP fallback
description: Why Replicate timeouts in replicateDemucs.ts must be kept well under Replit's SIGTERM window
---

## Rule
Keep `runModel()` timeouts in `replicateDemucs.ts` short:
- `voice_remove` (two_stems=vocals): **60 000 ms**
- `stem_split` (htdemucs 4-stem): **90 000 ms**

Any larger timeout causes "Processing failed" in the UI during production restarts.

**Why:** Replit sends SIGTERM to restart workers every ~30–60 minutes. If a Replicate poll is in-flight at restart time, the HTTP request is killed mid-wait. The concurrency slots (`concurrencyLimit(2)` in audio.ts) stay occupied until the in-flight handler exits. New requests hit 503 "Server is busy" which the frontend maps to "Processing failed". A 240 s timeout means up to 4 full minutes of stuck slots per restart cycle.

**How to apply:** Demucs rarely finishes in < 60 s for a full song — so the timeout almost always fires, the catch block runs, and `mlkVocalRemoval` / `mlkStemSplit` (both complete in < 5 s via ffmpeg) handle the request. Short clips may succeed via Demucs within 60 s. Either way the route never 500s and completes in well under Replit's 4-min proxy timeout.
