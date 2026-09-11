---
name: Investor outreach approval boundary
description: Safety and delivery rules for automated investor outreach
---

Automated investor outreach may dispatch only a stored queue item with an explicit recipient email, subject, body, due time, and queued status. An overdue manual touch record is not itself approval to synthesize or send a message.

**Why:** The investor tracker historically recorded only dates and route notes; treating those records as send authorization would risk inventing external communications or contacting non-email routes.

**How to apply:** Keep the daily overdue alert separate from the five-minute delivery worker. Queue messages explicitly, claim them atomically, retry bounded failures, and mark the touch/prospect sent only after Gmail confirms delivery.