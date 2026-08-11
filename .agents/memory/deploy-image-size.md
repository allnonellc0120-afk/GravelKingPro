---
name: Deployment image 8 GiB limit
description: Autoscale/cloud_run deploy fails at packaging when the container image exceeds 8 GiB; how to diagnose and shrink.
---

# Deployment image size limit (8 GiB)

Autoscale (cloud_run) publishes fail at the final packaging step with `error: image size is over the limit of 8 GiB`. The build/compile phases all pass (green checks) — this is NOT a code/build error, it's the final image being too large.

**Why (nix):** Large nix-closure system dependencies dominate the image. Adding full `pkgs.ffmpeg` (~0.97 GiB closure, pulls in X11/SDL/GUI libs) to an already-near-limit image pushed it over.

**Fix (nix):** Use `pkgs.ffmpeg-headless` instead of `pkgs.ffmpeg`. Headless closure is ~0.28 GiB, still provides the `ffmpeg` binary with all audio/video codecs + filters needed for server-side processing (lavfi, libmp3lame, libopus, libvorbis, libsoxr). It only disables ffplay/sdl2/xlib/libxcb (GUI playback), which the server never uses.

**Why (Python deps — primary confirmed cause):** `pyproject.toml` declared `demucs>=4.0.1` as a dependency. Demucs pulls in `torch`, `nvidia-*` CUDA packages, and `triton` as transitive deps. These alone total ~4.5 GB in `.pythonlibs` (nvidia/* 2.7 GB + torch 1.1 GB + triton 698 MB). The deploy bundles `.pythonlibs` as-is — this was the main cause of the >8 GiB failure. Fix: removed `demucs` from `pyproject.toml`, added explicit `numpy>=2.0`, `scipy>=1.10`, `psutil>=5.9` (the only deps the MLK V3.5 kernel actually needs), then ran `uv sync` to evict 45 packages. `.pythonlibs` dropped from 4.8 GB → 205 MB. Key check: `du -sh .pythonlibs` before publishing.

**Why (stray files):** The image includes the ENTIRE workspace Repl layer. Any large file sitting in the workspace root or in `attached_assets/` (user uploads from chat) is bundled into the container. Generated video exports, audio exports, etc. should never be committed to the workspace root.

**Why (gitignored caches):** The packaged Repl layer includes gitignored working-tree dirs — `node_modules`, `.cache/`, `.local/`. Gitignored does NOT mean excluded from the deploy image. The Python `uv` cache (`.cache/uv`) can balloon after installs.

**Fix (gitignored caches):** Before publishing, delete regenerable Python caches: `rm -rf .cache/uv .cache/torch .cache/pip`. Also verify `.pythonlibs` size — it should be under ~500 MB now that demucs/torch are removed. Keep `.cache/pnpm` and `.cache/typescript` (small + useful).

**How to diagnose:** Don't guess. `fetchDeploymentLogs` only returns RUNTIME logs (empty when deploy never promoted). Use `listDeploymentBuilds()` + `getDeploymentBuild(buildId)` callbacks (code_execution sandbox) to read the actual BUILD logs and see the real error. The image-over-limit error appears at the very end of the log after all build steps succeed.

**MLK V3.5 Python kernel:** Lives at `.local/mlk-repo/morris_law_kernel_v35_fast.py`. Requires ONLY numpy + scipy + psutil. Never needs torch/demucs/CUDA. The `demucs` audio separation path in `gkp-separator.ts` is dead-pathed — all audio processing uses in-process ffmpeg (MLK v3 JS kernel). Keep `pyproject.toml` with only numpy/scipy/psutil declared.

Update (later incident): root-level ad-hoc Python installs (torch/nvidia/triton/onnxruntime via pip/uv, NOT declared in pyproject.toml) land in `.pythonlibs` (~5 GB) and get bundled into the deploy image too. Check `du -sh .pythonlibs .cache/uv` before publishing; delete `.pythonlibs` whenever no workflow actually runs Python — UPM reinstalls only declared pyproject deps (~700 MB), so undeclared ML libs do not return. Do NOT `rm -rf .local/share/pnpm` — it is the pnpm store backing node_modules hardlinks; the safe shrink is `pnpm store prune` (once freed 1.4 GB of stale packages with zero breakage — hardlinked files survive in node_modules).

Update (Aug 2026 incident): image crept over 8 GiB with NO single new cause — chronic weight. Safe quick wins in order of payoff: `pnpm store prune` (~1.4 GB), delete `artifacts/*/dist` (rebuilt at publish; promo video artifacts duplicate 250+ MB of mp4s into dist), `rm -rf .cache/pnpm`, `git gc --prune=now`. Structural fat that needs user sign-off: `attached_assets/` (500 MB of chat uploads incl. an .aab and screen recordings), duplicated 51 MB promo masters in BOTH gravelkingpro-promo and gravelkingpro-speed-promo public/videos, `.git/lfs` (276 MB, `git lfs prune` candidate). The whole workspace incl. `.git` ships in the Repl layer. Check headroom with `du -sh /home/runner/workspace` (target ≤ ~5.5 GB).
