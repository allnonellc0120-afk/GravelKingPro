---
name: Static deployment cache headers
description: Where cache-control headers belong for artifact-based static deployments
---

Artifact frontends served with `serve = "static"` do not use the API Express app for production static responses. Configure response headers in the root `.replit` file with `deployment.responseHeaders`, and validate the replacement through Replit's `.replit` validator.

**Why:** Adding cache middleware to the API server does not affect the artifact static handler, so customers can still receive stale HTML or service-worker files after a publish.

**How to apply:** Set no-store headers on the root/route HTML, service worker, and manifest paths only. Leave hashed `/assets/*` files without an overriding header so immutable asset caching remains effective.