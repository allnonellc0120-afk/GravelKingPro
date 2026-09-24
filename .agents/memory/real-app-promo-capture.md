---
name: Real-app promo capture pipeline
description: How the 59 s promo was captured from the live app (not mock scenes) and aligned to real audio
---
Rule: promo videos must be recorded from the running app; no CSS mock scenes or synthesized tone beds (user rejected those as "junk").

**How to apply:** scripts live in artifacts/gravelking-promo/scripts (capture-stage.mjs, capture-mastering.mjs, compose-stage-promo.py).
- Duet stage: two headless Chromiums with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` join the same `/stage/duet/<code>`; seed the vault via IndexedDB `gkp-stage-catalog/workshops` and arm with `?song=<id>`; close the FX rack after "Monitor mic".
- Align video to audio with a 100 ms white flash injected on the Play click, then locate it with `signalstats` YAVG > 150 (recordVideo start time is not reliable).
- Mastering UI: pass the curl cookie jar (gk_session + gk_admin, lines are `#HttpOnly_` prefixed) into the context; Pro presets stay disabled for admin sessions — use Baseline. `/api/kernel/master` multipart field is `audio`.
- Loudness-match raw vs mastered before the A/B switch (source was louder than the master) so the switch is not just a volume drop.
