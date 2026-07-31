---
name: Mastering certification is opt-in
description: /api/kernel/master must never gate on copyright checks; IP cert/watermark only when client sends certify=true; masters always stream in-app bytes
---

Product decision (user-stated, emphatic): the mastering tool must master ANY track — karaoke, covers, reference mixes — with no copyright validation, no ownership warranty, and no watermark. Copyright checking and the IP cert are opt-in only (`certify=true` form field, UI checkbox "Certify this as my original work").

**Why:** The user was denied masters of karaoke tracks by the unconditional `validateAssetIngestion` middleware (422 ERR_COPYRIGHT_WARRANT_REQUIRED). Mastering is a utility; certification is a separate legal claim the user chooses to make.

**How to apply:**
- Never re-attach `validateAssetIngestion` unconditionally to `/api/kernel/master`; the conditional wrapper `maybeValidateIngestion` in master.ts gates it on `certify=true`.
- When `certify` is off: skip hash, nominator/denominator split, DB/Firestore stubs, and LSB embed — ship the carved buffer untouched.
- Masters always stream back as audio bytes (`streamBuffer`) for in-app playback/download — the user rejected external signed-URL delivery ("no outsourcing to any other apps"). Do not restore the object-storage JSON url path.
- Studio routes (studio-mix/process-audio) still use `validateAssetIngestion` directly — those are the certified-studio pipeline; only the mastering route is opt-in.
