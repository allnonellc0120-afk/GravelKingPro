---
name: Certificate document paywall
description: How cert JSON/PDF privacy, per-cert unlocks, and the included allowance work
---

Stamping is FREE; the court document (JSON/PDF at /api/court-cert/:certId[.pdf]) is the paid artifact.

**Rules**
- Owner-only + unlocked-only, enforced server-side in court-cert.ts. Non-owners get 404 (no cert-id probing). Ownerless legacy stubs fail closed. Only `/api/court-cert/example` is public (fabricated data).
- Free/weekly: $1.99 one-time permanent unlock per cert via payment-mode Stripe Checkout (metadata kind=cert_unlock, cert_id, user_id). Webhook grant is an owner-scoped conditional UPDATE (`unlocked_at IS NULL`) → idempotent on duplicate deliveries.
- King/Node Auditor: 20 included unlocks per rolling 30 days (users.cert_unlocks/cert_unlock_period_start, same atomic reset-or-increment as exportQuota). Unlock claims the stub first (conditional on still-locked), then consumes the allowance, rolling back the claim if exhausted — so races never double-consume.
- Stub carries owner_user_id, category (lyrics|instrumental|full_track|vocal_performance), provenance (internal|external_upload|vocal_recording). mlkOrchestrator writes internal; the master route can never claim 'internal'.

**Why:** cert docs leaked publicly by certId before; weekly users must not inherit the Studio allowance (owner directive).

**Express 5 route-order gotcha:** `GET /x/:id` registered before `GET /x/:id.pdf` swallows the .pdf URLs (param matches the dot) → the .pdf route is dead and returns the JSON route's 404. Register the `.pdf` route FIRST.
