---
name: Deployment image 8 GiB limit
description: Autoscale/cloud_run deploy fails at packaging when the container image exceeds 8 GiB; how to diagnose and shrink.
---

# Deployment image size limit (8 GiB)

Autoscale (cloud_run) publishes fail at the final packaging step with `error: image size is over the limit of 8 GiB`. The build/compile phases all pass (green checks) — this is NOT a code/build error, it's the final image being too large.

**Why:** Large nix-closure system dependencies dominate the image. Adding full `pkgs.ffmpeg` (~0.97 GiB closure, pulls in X11/SDL/GUI libs) to an already-near-limit image pushed it over.

**Fix applied:** Use `pkgs.ffmpeg-headless` instead of `pkgs.ffmpeg`. Headless closure is ~0.28 GiB, still provides the `ffmpeg` binary with all audio/video codecs + filters needed for server-side processing (lavfi, libmp3lame, libopus, libvorbis, libsoxr). It only disables ffplay/sdl2/xlib/libxcb (GUI playback), which the server never uses. Manage it via the package-management skill's `installSystemDependencies`/`uninstallSystemDependencies` — direct edits to `replit.nix` are blocked.

**How to diagnose:** Don't guess. `fetchDeploymentLogs` only returns RUNTIME logs (empty when deploy never promoted). Use the deployment-failure-debugging reference's `listDeploymentBuilds()` + `getDeploymentBuild(buildId)` callbacks (code_execution sandbox) to read the actual BUILD logs and see the real error.

**If still over after headless swap:** trim other heavy nix deps, avoid bundling dev-only stuff, and remember the deployment builds each artifact separately via its own `.replit-artifact/artifact.toml` `[services.production.build]` (mockup-sandbox has no production config, so it's excluded from deploy).
