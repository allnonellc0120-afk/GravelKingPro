---
name: JAX admin generation ownership
description: Ownership behavior for JAX music generation invoked through admin automation
---

Admin automation bypasses authentication limits but does not populate `req.dbUser`, so the JAX music route can persist a private track with a null owner and no library purchase row. A successful admin-triggered generation must be associated with the intended owner profile and a matching purchased_tracks row before delivery is considered complete.

**Why:** The route is designed for signed-in users and only inserts the library row when `req.dbUser.id` exists; admin header authentication alone is not an owner identity.

**How to apply:** After an admin automation generation, resolve the owner explicitly, set the track owner, insert or upsert the owner’s library row, and verify `/api/library` plus `/api/tracks/:id/stream` before reporting completion.