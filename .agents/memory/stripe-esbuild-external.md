---
name: stripe-replit-sync esbuild external
description: stripe and stripe-replit-sync must be marked external in esbuild or migrations silently skip
---

`stripe-replit-sync`'s `runMigrations()` uses `path.resolve(__dirname, "./migrations")` to find SQL files. When esbuild bundles it inline, `__dirname` points to the output `dist/` folder (not the package's own `dist/`), so `fs.existsSync(migrationsDirectory)` returns false and migrations are silently skipped — the `stripe` schema exists but has no tables, and `findOrCreateManagedWebhook` subsequently fails with "relation stripe.accounts does not exist".

**Why:** esbuild inlines the package code and rewrites `__dirname` to the bundle output directory via the banner. External packages are loaded from `node_modules` at runtime and keep their own `__dirname`.

**How to apply:** In `artifacts/api-server/build.mjs`, keep `"stripe"` and `"stripe-replit-sync"` in the `external` array. Never remove them. If you add other packages that load sibling files via `__dirname` or `__filename`, externalize those too.
