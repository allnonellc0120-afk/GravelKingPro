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

- **4K master exports: use the ffmpeg compositing pipeline, NOT browser canvas capture.** Browser capture at 4K stalls the rAF loop and produces files with ~29 unique frames in 59s (visible skipping) despite valid 30fps container metadata — always verify exports with `ffmpeg -vf mpdecimate` (expect >1400 unique frames/59s).
  **Why:** the 2026-08 "skipping" masters were browser-captured; re-encoding can't recover frames never captured.
  **How to apply:** render per-beat segments with ffmpeg (fps=30, scale/crop to 4K, drawtext for kinetic headlines sized off min(W,H) so 9:16 doesn't overflow), concat, then mux a separate audio mix (VO adelay per beat + sidechaincompress-ducked music). Escape drawtext apostrophes or avoid them. Chunk long renders (<5 min per shell call) with a per-beat cache; interrupted ffmpeg leaves moov-less truncated files — probe each beat before concat.

- **In-page preview of finished promos needs lightweight dual-format files.** Pointing `<video>` at the 4K masters (200MB+) stalls forever on spinners, and the preview/test browser lacks H.264 High-profile decode — plays only WebM (VP8/Vorbis). Serve ~1080p preview copies with BOTH `<source>` mp4 + webm children plus a poster frame; keep 4K masters separate for delivery.

- **Never name a bash array `LINES`** — the terminal-height env var silently clobbers it, so every drawtext beat renders empty (video looks fine but has no headlines). Use a name like `BEATTXT`, and QA at least one extracted frame per format before concat.

- **Browser-captured logo exports need a painted pre-roll.** Playwright video recording begins before the navigated page paints, so export pages should paint a dark inline pre-roll before navigating to the animated scene; otherwise frame 0 can be an unintended white flash.
  **Why:** the recorder attaches at browser-context creation, before the scene page's CSS and assets are available.
  **How to apply:** use an inline dark `setContent` pre-roll, wait briefly, then navigate to the export route and QA frame 0 plus a mid-scene frame.
