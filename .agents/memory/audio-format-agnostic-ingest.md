---
name: Audio ingest is format-agnostic
description: Why mobile mic recordings (.m4a/AAC, web .webm) flow through every audio tool with no server change
---

# Audio ingest is format-agnostic

The processing endpoints (`/api/kernel/process-audio`, `/api/kernel/master`, studio-mix)
accept **any** audio container without a format gate:

- multer is configured with **no `fileFilter`** — any uploaded file is accepted.
- `sanitizeExt` in `lib/audioGuards.ts` permits arbitrary extensions; it only sanitizes
  the string used to name the temp file, it does NOT restrict format.
- ffmpeg/ffprobe **auto-detect the demuxer from file content**. The extension only names
  the temp file on disk; it does not force a demuxer.

**Why this matters:** expo-av records HIGH_QUALITY = `.m4a`/AAC on native and `.webm`/opus
on web. Both decode and process end-to-end with zero backend changes. So a new client-side
capture path (mic recording) needs no server work — just send the file like the picker did.

**How to apply:** Don't add a server-side allowlist or conversion step "to support a new
input format." If a client can produce a file ffmpeg can read, it already works. Only the
client side (URI + a plausible name/mime) needs handling.
