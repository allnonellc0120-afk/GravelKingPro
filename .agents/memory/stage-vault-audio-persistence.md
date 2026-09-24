---
name: Stage Vault audio persistence
description: Durable browser-storage rules for Track Prep packages, especially on iOS Safari.
---

# Stage Vault audio persistence

Store original uploaded audio as compressed `Blob` values alongside JSON lyric timing, guide alignment, and mixer metadata. Do not expand decoded `AudioBuffer` channel data into IndexedDB.

**Why:** Expanded PCM channel arrays are much larger than the source upload and can trigger IndexedDB connection loss on iOS Safari. Browser database connections may also become invalid between open and transaction creation.

**How to apply:** Decode stored Blobs only when loading a song for playback. Keep legacy PCM-record decoding for existing entries, and reopen/retry a transaction once for recoverable IndexedDB connection errors.