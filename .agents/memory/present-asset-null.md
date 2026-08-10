---
name: presentAsset null result
description: What a null return from presentAsset means and how to recover
---
**Rule:** When `presentAsset` returns `null`, treat it as a failed handoff — most often the file no longer exists on disk (e.g. /tmp renders and even workspace copies can vanish after environment restarts). Never assume the card posted.

**Why:** The Google Play promo card came back null twice; the underlying MP4 in both /tmp and attached_assets/generated had been wiped, so re-calling presentAsset alone could never work.

**How to apply:** Before (re)presenting a media asset, verify with `ls`/`ffprobe` and a quick decode check (sample frames at start/middle/end). If missing, re-export from source footage first, then present. A successful call prints a result instead of null.
