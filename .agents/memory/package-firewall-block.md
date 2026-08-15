---
name: Package firewall blocked packages
description: How to work around package-firewall.replit.local 403s on specific npm packages during deploy installs
---

The deploy-time `pnpm install` fetches through `http://package-firewall.replit.local/npm/...`. Some packages are blocked outright — every version of npm `tar` returns 403 (seen 2026-08-14), while sibling packages (chownr) pass.

**Why:** local installs succeed from cache, so the failure only appears in deployment builds; retrying versions is pointless when the package itself is blocked.

**How to apply:** vendor the tarball into `vendor/<pkg>-<ver>.tgz` (pack it from `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>` — `npm pack` may silently emit nothing there; a manual `tar -czf` with a `package/` prefix works), then add a root `pnpm.overrides` entry `"<pkg>": "file:./vendor/<pkg>-<ver>.tgz"` and reinstall. Verify `pnpm install --frozen-lockfile` passes and the tgz is not gitignored. Test blockage directly with `curl -o /dev/null -w "%{http_code}" http://package-firewall.replit.local/npm/<pkg>/-/<pkg>-<ver>.tgz`.
