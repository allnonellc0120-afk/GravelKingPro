---
name: Deployment build typechecks all artifacts
description: Why a TS error in one artifact (even mobile) blocks the whole production publish
---

The production deploy build runs root `pnpm run build`, which is
`pnpm run typecheck && pnpm -r --if-present run build`. The `typecheck` step
runs `tsc --noEmit` across EVERY artifact and `scripts` — including the Expo
mobile app — not just the web/API stack being deployed.

**Why:** A single TS error anywhere (e.g. the mobile app) fails the whole
build and silently blocks unrelated fixes (e.g. an ffmpeg system-dep fix) from
ever reaching production, even though dev keeps running fine.

**How to apply:** When a publish fails, run `pnpm run typecheck` locally and
read the tail — it pinpoints which artifact/file failed. Fix it before
re-publishing. Don't assume the failing artifact is the one you were working on.

The deploy then runs `pnpm -r --if-present run build`, which builds EVERY
artifact, not just the deployed web/API. Dev-only artifacts (e.g. the
mockup-sandbox Canvas tool, kind: design) whose vite.config.ts throws when
`PORT`/`BASE_PATH` are unset will fail the whole publish. Fix: remove the
`build` script from such dev-only artifacts so `--if-present` skips them
(dev/preview scripts stay). Reproduce locally with
`PORT=8080 BASE_PATH=/ pnpm run build`.
