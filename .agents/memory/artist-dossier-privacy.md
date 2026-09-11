---
name: Artist dossier privacy
description: User-isolated artist memory storage and prompt injection rules
---

Artist memory must be stored under the authenticated database user ID, with a per-user opt-in flag. The server must load that row itself for JAX generation and ignore client-supplied profile data as a source of truth.

**Why:** The dossier contains sensitive personal context and must never leak across accounts or be re-enabled by a crafted request when the user has disabled personalization.

**How to apply:** Scope every read, update, and delete by the authenticated user ID; inject only when the stored opt-in flag is true; keep clear-memory destructive actions account-scoped and explicit.