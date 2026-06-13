---
name: getUserMedia exact deviceId fallback
description: Why selecting/remembering a specific mic needs a record-time fallback when the device is gone
---

# getUserMedia exact deviceId fallback

`navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id } } })`
throws `OverconstrainedError` (sometimes `NotFoundError`) when that input is no
longer connected — it does **not** silently fall back to the system default the
way an `ideal` constraint would.

**Why:** the DAW input picker / "remember last mic" persistence can hand a stale
deviceId to recording after the device was unplugged. Without a fallback the
user just gets a "could not start recording" error instead of recording from
the default input.

**How to apply:** when starting capture with a specific deviceId, wrap the
`getUserMedia` call and, on `OverconstrainedError`/`NotFoundError`, retry once
**without** the deviceId constraint. (Permission is already granted at that
point, so the retry won't re-prompt.) `enumerateDevices()` returns
empty-deviceId placeholders before mic permission is granted, so you cannot
reliably validate a saved deviceId in the UI alone — the record-time retry is
the reliable guarantee.
