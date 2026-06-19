---
name: Mobile (Expo) audio result handling
description: How to deliver processed audio bytes to the user on native Expo — object URLs and Linking blob: do not work
---

On native React Native / Expo, `URL.createObjectURL(blob)` + `Linking.openURL("blob:...")` is a web-only pattern. The OS cannot open `blob:` URLs in the share sheet or an external player, so processed audio "downloads"/"plays" silently fail on device even though the server returned correct bytes.

**Why:** The mobile Studio processed audio fine but Download/Play did nothing on iPad because results were materialized as object URLs and handed to `Linking.openURL`. Web preview hid this (object URLs work in the browser).

**How to apply (cross-platform helper):**
- Prefer `res.arrayBuffer()` over `res.blob()` then `blob.arrayBuffer()` — RN Blob's `arrayBuffer()` is unreliable; `Response.arrayBuffer()` works in RN 0.81 / Expo SDK 54.
- Materialize bytes to a real file on native: expo-file-system **new API** (SDK 54+, v19): `const f = new File(Paths.cache, name); f.create(); f.write(uint8Array);` then use `f.uri`. `write` accepts a `Uint8Array` directly (no base64 needed). On web, keep `URL.createObjectURL`.
- Play with expo-av `Audio.Sound.createAsync({ uri }, { shouldPlay: true })` on native, `window.Audio` on web.
- Save/export with expo-sharing `Sharing.shareAsync(fileUri, { mimeType, UTI })` on native (opens OS share sheet → save to Files), `Linking.openURL` on web.
- Cache files are not auto-revoked; rely on OS cache eviction or add explicit cleanup if users process many large files per session.
