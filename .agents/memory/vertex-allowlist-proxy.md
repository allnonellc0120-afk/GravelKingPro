---
name: Vertex allowlist proxy
description: Local Vertex interception boundary, production direct path, and response handling constraint
---

The GK Pro Vertex interception boundary is a dedicated loopback service for development. Published API instances without an explicit proxy URL must use direct Vertex HTTPS endpoints; never use a dead loopback proxy in production or replace the local boundary with global HTTP_PROXY/HTTPS_PROXY settings.

**Why:** Global proxy variables would redirect unrelated Stripe, Clerk, storage, and Google traffic and could expose bearer credentials to an unapproved listener. Node fetch transparently decodes compressed upstream responses, so forwarding the original content-encoding header makes downstream clients see an invalid body.

**How to apply:** Route development Vertex v1 and global Interactions calls through the local allowlist service, route production calls directly to Vertex only when no explicit proxy is configured, preserve request Authorization/body values, and remove content-encoding when relaying fetch-decoded response bytes.

The proxy is fail-closed on audit-ledger writes: it must not relay any upstream response unless the matching JSONL record is durably appended; write failures return 503 and emit a structured operational error.

**Why:** Returning a completed Vertex response without its audit row creates an untraceable request and defeats the ledger’s compliance purpose.

**How to apply:** Keep ledger writes serialized but observable by callers; recover the queue after an individual failure so later requests can succeed once storage returns.