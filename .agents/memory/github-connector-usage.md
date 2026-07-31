---
name: GitHub connector usage
description: How to call the GitHub API from this workspace — sandbox listConnections fails; use connectors-sdk proxy script; empty-repo bootstrap pattern
---

# GitHub connector usage

**Rule:** `listConnections('github')` returns `[]` in the CodeExecution sandbox even when searchIntegrations reports the connection as `added`. Don't loop on it or re-propose the integration — go straight to the application-code path: a workspace-root Node script using `@replit/connectors-sdk` (`connectors.proxy("github", path, opts)`), run via shell. Proxy returns a raw fetch Response — call `.text()`/`.json()`.

**Why:** Credentials for this connection are withheld from the sandbox helper context; the connectors-sdk proxy path works (same pattern as the Gmail connector). Confirmed July 2026.

**How to apply:** Script must live at workspace root (ESM resolution needs root node_modules; `@replit/connectors-sdk` is a root dependency). Write temp script → `node script.mjs` → delete.

**SDK export shape (July 2026):** the package is CJS exposing only the class `ReplitConnectors` — in an `.mjs` script use `import pkg from "@replit/connectors-sdk"; const connectors = new pkg.ReplitConnectors();`. There is no bare `connectors` named export. `connectors.proxy(id, path, init)` returns a raw fetch Response.

**Transient Git Data 500s:** POST `/git/trees` can return empty-body 500s in bursts (blobs/refs/commits unaffected) and recover a minute later. Retry with backoff; if a burst outlasts retries, probe with a tiny standalone tree POST and re-run — don't rewrite the flow.

**Empty-repo bootstrap:** GitHub's Git Data API returns 409 "Git Repository is empty" for blob creation on a fresh no-auto-init repo. Bootstrap: PUT one file via Contents API (creates the branch), then blobs → tree → root commit (`parents: []`) → PATCH the ref with `force: true` for a single clean root commit.
