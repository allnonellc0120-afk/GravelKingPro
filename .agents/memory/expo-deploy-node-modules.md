---
name: Expo deploy builds against working-tree node_modules
description: Deploy-time Metro "Unable to resolve module X" when a committed dep isn't materialized in the working-tree node_modules.
---

# Expo deploy bundling uses the working-tree node_modules

The deployment build runs Metro / `expo export` against the **working-tree `node_modules`**, not a fresh clean install from the lockfile. So a dependency that is correctly declared in `package.json` AND present in the committed `pnpm-lock.yaml` (importer entry + packages section) can still fail at deploy time with `Unable to resolve module <pkg> from <file>` if the working-tree `node_modules` is out of sync (the package was never materialized on disk).

**Why:** pnpm can print "Lockfile is up to date, resolution step is skipped" while `node_modules` is still missing packages (stale/partial install). A correct lockfile does NOT guarantee `node_modules` is materialized.

**How to apply:**
- Symptom: deploy build log shows Metro `Unable to resolve module X` even though `git show HEAD:<app>/package.json` and `HEAD:pnpm-lock.yaml` both contain X.
- Fix: `pnpm install` at repo root to re-materialize `node_modules` (watch for `+N` packages added even when the lockfile is "up to date").
- Verify before re-publishing: `cd artifacts/<expo-app> && npx expo export --platform ios` and `--platform android` must exit 0 — these run the exact bundling the deploy does. Use a port other than the running expo dev server (8081), or stop it first, to avoid a silent kill.

The mobile artifact's static builder now auto-selects the first available Metro port starting at 8081 and uses it consistently for health checks, bundles, manifests, and asset URLs.

**Why:** The shared component-preview workflow can occupy 8081, causing Expo's non-interactive `expo start` to ask for a port and then exit during deployment.

**How to apply:** Keep `METRO_PORT` available as an override, but let the builder probe and increment automatically for normal publishing.
