---
name: Google Play deletion page
description: Public account-deletion compliance page and release-domain verification for GravelKing Pro
---

The Google Play account/data deletion URL must be the live `.com` route and its important instructions must exist in the prerendered HTML, not only in the React client.

**Why:** Store policy validators may request the URL without executing the SPA bundle; a client-only route can return HTTP 200 while appearing empty to the validator.

**How to apply:** Keep the public route unauthenticated, include the request email, deleted data categories, and the 30-day completion window in both the React page and the prerender fallback. When the TWA host changes, rebuild and re-sign the Version 5 AAB/APK, then inspect the packaged host and version metadata before Play upload.