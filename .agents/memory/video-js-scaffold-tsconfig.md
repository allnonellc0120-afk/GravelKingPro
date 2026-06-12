---
name: video-js scaffold tsconfig missing DOM lib
description: New video-js artifacts fail tsc typecheck on browser globals until the DOM lib override is added
---

# video-js scaffold tsconfig omits the DOM lib

A freshly scaffolded `video-js` artifact's `tsconfig.json` does NOT include a `lib`
override, so it inherits `tsconfig.base.json`'s `"lib": ["es2022"]` (no DOM). As a
result `pnpm --filter @workspace/<slug> run typecheck` fails on browser globals —
`window`, `document`, `Node`, `PointerEvent.pointerType`, and
`HTMLAudioElement.volume/currentTime/play` — including in the scaffold's own
untouched `src/lib/video/hooks.ts` and `src/main.tsx`.

**Fix:** add `"lib": ["esnext", "dom", "dom.iterable"]` to the artifact's
`tsconfig.json` `compilerOptions` (matches what every web artifact, e.g.
`artifacts/gravelkingpro`, already does). Typecheck-only change — Vite/esbuild
already assumes DOM at runtime, so no workflow restart is needed.

**Why:** the video-js build/validation flow (validate-recording.sh + Vite logs)
never runs `tsc`, so the scaffold ships with this gap unnoticed. It only surfaces
if you run a typecheck or repo-wide validation. The DOM-lib errors are config
noise, not real bugs in scene/audio/control code that follows the skill references.

**How to apply:** verify the scaffold still ships without the `lib` line before
relying on this (it may be fixed upstream). If a new video artifact's typecheck
shows `Cannot find name 'window'/'document'`, this is the cause.
