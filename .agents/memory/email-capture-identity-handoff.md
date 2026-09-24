---
name: Email capture identity handoff
description: Durable constraint for free-tool email capture when an email already belongs to another local user.
---

Resolve the canonical users row by normalized email before assigning the email to an anonymous usage row. If the email already exists, clear the anonymous row's unique session token and attach that token to the canonical account in one transaction.

**Why:** users.email and users.session_id are both unique. A blind email update can produce a duplicate-key error, and moving a token without clearing the anonymous row can create a second unique-key error.

**How to apply:** Keep email capture find-or-link behavior concurrency-safe, and verify both the HTTP response and the resulting session linkage.