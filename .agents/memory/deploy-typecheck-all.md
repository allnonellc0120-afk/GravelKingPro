---
name: Deployment builds each artifact separately
description: How the production publish actually builds — per-artifact, not one repo-wide build/typecheck
---

The production deploy does NOT run a single repo-wide `pnpm run build` or
`pnpm run typecheck`. With `.replit` `[deployment]` `router = "application"` and
NO `[deployment.build]` pre-build hook, each artifact is built independently via
its own `.replit-artifact/artifact.toml` `[services.production.build]`:

- web (`@workspace/gravelkingpro`): `pnpm --filter ... run build` (vite) → static
- api (`@workspace/api-server`): `pnpm --filter ... run build` (esbuild)
- mobile (`@workspace/gravelkingpro-mobile`): `node scripts/build.js` (Metro
  static export — transpiles, does NOT strict-typecheck)
- mockup-sandbox (kind: design): NO `[services.production]` → excluded from deploy

**Why it matters:** A TS error only blocks the publish if it lives in a package
whose production.build actually runs `tsc`. A mobile-only TS error won't fail the
Metro export. So "fix the repo-wide typecheck" is the wrong mental model — find
which artifact's build step fails.

**How to apply:** When a publish fails, read the REAL build logs via
`listDeploymentBuilds()` + `getDeploymentBuild(buildId)` (code_execution sandbox)
— don't guess. The phases are build → promote → serve; the log says which failed.
Note the failure can be non-code, e.g. the final image exceeding 8 GiB
(see deploy-image-size.md).
