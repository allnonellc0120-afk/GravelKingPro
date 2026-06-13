---
name: GravelKing promo video conventions
description: How the promo video artifact maps product/marketing requirements to scenes
---

- The promo (`artifacts/gravelkingpro-promo`) plays a fixed sequence of scenes (Scene1–Scene7) driven by `SCENE_DURATIONS` in `VideoTemplate.tsx`; audio is a single pre-rendered `public/audio/composite_audio.mp3` seeked per-scene.

- **"audio mix voice 0 dB / instruments -2 dB" is a *visual* spec, not an audio re-encode.** There is no per-stem source audio or generation script for the promo, so this requirement is satisfied by the Mix Studio showcase scene (Scene5) rendering per-stem channel strips with Voice at 0.0 dB and instrument stems at -2.0 dB.
  **Why:** the only promo audio asset is the composite mp3; separating stems would require regenerating audio we don't have sources for.
  **How to apply:** when promo requests mention stem levels/metering, render them as DAW mockup visuals in Scene5, keep the composite audio as-is.

- Scene content must track the real product: removed-bloat features (AI beat maker, songwriter/lyrics generator) must not appear in any scene. Selling points = voice removal, stem splitting, preset + adjustable mastering, live DAW recording, per-stem metering/knobs.

- Use `vw`-based font sizes and container `px-[Nvw]` padding to avoid cut-off text across viewport sizes; verify a scene visually by temporarily rendering it directly from `App.tsx` (then revert) since the player auto-loops and screenshots usually land on Scene1.
