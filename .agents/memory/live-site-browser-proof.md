---
name: Driving a real browser against the live site from the workspace
description: How to run Playwright against production for interactive proof/debugging on NixOS without bloating the deploy image
---

Playwright's downloaded chromium-headless-shell crashes on NixOS (`libglib-2.0.so.0` missing). Installing nix `chromium` as a project system dependency works but ships in the publish image.

**Working recipe (zero deploy-image footprint):**
- Playwright the npm package is already at the workspace root; drive it via its compiled path under `node_modules/.pnpm/playwright@*/node_modules/playwright`.
- Do NOT let `playwright install` write into `workspace/.cache` — deploys bundle gitignored `.cache`. Keep browser downloads out of the workspace (e.g. `/tmp`), or skip them entirely.
- Get a runnable browser ad hoc: `nix-shell -p chromium --run '...'` and pass `executablePath: $(which chromium)` with `--no-sandbox --disable-dev-shm-usage`. nix-shell store paths don't enter the deploy config.

**Why:** the user's live-site complaints can only be settled with an interactive session (fill form → click → wait → screenshot); the static Screenshot tool can't interact, and curl can't see client-rendered state.

**How to apply:** whenever proof of live behavior after interaction is needed, or SW/stale-cache theories must be tested against production.
