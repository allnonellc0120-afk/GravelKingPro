---
name: Stale lib/db dist declarations
description: api-server typecheck fails on missing schema fields when lib/db/dist .d.ts files are stale
---

`lib/db` is a composite TS project reference (`emitDeclarationOnly` → `dist/`), but its package.json `exports` point at `src/*.ts` and it has **no build script** — nothing rebuilds `dist/` automatically. After schema edits, `artifacts/api-server` typecheck resolves the project reference against stale `dist/*.d.ts` and reports missing columns/tables that clearly exist in `src/schema`.

**Why:** typecheck errors like "property generationModel does not exist on ipCertStubsTable" or "no exported member investorProspectsTable" looked like schema drift but were only stale generated declarations.

**How to apply:** when api-server typecheck complains about schema fields that exist in `lib/db/src/schema`, run `pnpm exec tsc -b lib/db --force` from the workspace root first, then re-run the typecheck.
