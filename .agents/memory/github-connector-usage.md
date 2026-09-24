---
name: GitHub connector usage
description: How to call the GitHub API from this workspace — sandbox listConnections fails; use connectors-sdk proxy script; empty-repo bootstrap pattern
---

# GitHub connector usage

**Rule:** `listConnections('github')` returns `[]` in the CodeExecution sandbox even when searchIntegrations reports the connection as `added`. Don't loop on it or re-propose the integration — go straight to the application-code path: a workspace-root Node script using `@replit/connectors-sdk` (`connectors.proxy("github", path, opts)`), run via shell. Proxy returns a raw fetch Response — call `.text()`/`.json()`.

**Why:** Credentials for this connection are withheld from the sandbox helper context; the connectors-sdk proxy path works (same pattern as the Gmail connector). Confirmed July 2026.

**How to apply:** Script must live at workspace root (ESM resolution needs root node_modules; `@replit/connectors-sdk` is a root dependency). Write temp script → `node script.mjs` → delete.

The GitHub REST proxy can update refs only when the target commit object already exists in GitHub; it is not a replacement for Git smart-HTTP pack transfer of a large local history.

**Why:** a local release commit may be valid in Replit but unknown to GitHub, producing `422 Object does not exist` on ref updates even when the connector is authenticated.

**How to apply:** use an authenticated Git transport for existing local commit graphs; use the REST proxy only for Git objects that have already been uploaded or for intentionally creating a new API-side commit/tree.

**SDK export shape (July 2026):** the package is CJS exposing only the class `ReplitConnectors` — in an `.mjs` script use `import pkg from "@replit/connectors-sdk"; const connectors = new pkg.ReplitConnectors();`. There is no bare `connectors` named export. `connectors.proxy(id, path, init)` returns a raw fetch Response.

**Transient Git Data 500s:** POST `/git/trees` can return empty-body 500s in bursts (blobs/refs/commits unaffected) and recover a minute later. Retry with backoff; if a burst outlasts retries, probe with a tiny standalone tree POST and re-run — don't rewrite the flow.

For a full workspace export, prefer Git transport over thousands of connector
blob calls. The connector enforces 10 requests/second and tree creation can
time out even after all blobs have uploaded.
**Why:** repeated API uploads do not guarantee a publishable commit.
**How to apply:** use an existing Git credential via a per-command credential
helper without printing it. Preserve divergent remote history; a snapshot
commit parented to the remote tip avoids force-pushing local checkpoint history.
Audit ignored build manifests as well as tracked files: a blanket JSON ignore
can silently omit package manifests and make an otherwise clean export unusable.

**Empty-repo bootstrap:** GitHub's Git Data API returns 409 "Git Repository is empty" for blob creation on a fresh no-auto-init repo. Bootstrap: PUT one file via Contents API (creates the branch), then blobs → tree → root commit (`parents: []`) → PATCH the ref with `force: true` for a single clean root commit.
