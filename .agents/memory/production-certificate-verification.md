---
name: Production certificate verification
description: Requirements for proving generated certificate attribution after a publish
---

Generated MLK certificates are minted only when fingerprinting returns a global `no_match` result from the ACRCloud provider. A successful Lyria generation with local-only or unavailable scanning is intentionally saved without a certificate, so it cannot be used to test the unlock document.

**Why:** Local signature matching does not establish worldwide commercial-catalog clearance, and the certificate must not claim that it did.

**How to apply:** After publishing, confirm the runtime is using the global ACRCloud path and that the generated certificate is actually present before attempting unlock verification.

As of 2026-09-05, the owner explicitly deferred global scanning: production intentionally runs the local-signature scan only until the owner procures a paid ACRCloud (or equivalent) API themselves. Do not treat the absence of generated `no_match` certificates as a regression in the meantime, and do not reintroduce or auto-configure a global scan without the owner's keys.