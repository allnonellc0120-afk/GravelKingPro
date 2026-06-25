---
name: Web iOS download + Web Audio playback gotchas
description: Two iOS-Safari WebKit constraints that silently break the gravelkingpro web app — file downloads and Web Audio playback
---

# iOS Safari download + Web Audio playback

Two separate iOS-Safari behaviors that produce silent failures in the **web** app
(`artifacts/gravelkingpro`). Both are about WebKit's user-gesture / navigation rules,
not the audio pipeline.

## Downloads must use the anchor `download` attribute, never `window.open(url)`
`window.open(blobURL, "_blank")` makes iOS *navigate to* the blob and hand it to a
registered handler app (users reported files opening in "Tully"). The fix is an
anchor with the `download` attribute on **every** platform — it routes to the iOS
Files "Save to…" sheet and saves directly on desktop. There is no iOS special-case.

**How to apply:** all web downloads go through `src/lib/download.ts` —
`downloadBlob(blob, name)` for temporary fetched/in-memory blobs (revokes the
object URL after ~10s), `downloadUrl(url, name)` for URLs that stay alive elsewhere
(e.g. a `resultUrl` bound to an `<audio>` element — do NOT revoke those). Never
reintroduce `window.open` for a download.

## Web Audio playback needs ctx.resume() inside the user gesture
The Studio page plays via Web Audio (`AudioContext` + `AudioBufferSourceNode`),
not `<audio>`. iOS (and Chrome autoplay policy) start the context **suspended**;
`source.start()` then fires with no sound. Must `await ctx.resume()` (helper
`ensureAudioRunning`) at the top of each play handler, **before** the first long
`await` (blob read / decode), so it stays within the click gesture.

**Why:** if the resume happens after an `await`, the gesture is no longer "active"
and iOS leaves the context suspended → silent playback.
**How to apply:** any new Web Audio play path on the web must resume first. Note
the dedicated voice-removal / mastering / convert pages use native `<audio controls>`
and are NOT affected — this only bites Web Audio (Studio, DAW, live monitor).

## A 2nd synced `<audio>.play()` must start in the SAME gesture, not after an await
When two `<audio>` elements play together (e.g. backing track + a synced guide
vocal), the second element's `play()` must be kicked off in the same user gesture
as the first — do NOT `await first.play()` then call `second.play()`. iOS treats
the second call as no-longer-in-a-gesture and silently blocks it, so the guide is
absent with no error.
**How to apply:** set both `currentTime`/`muted` synchronously, then launch both
together: `await Promise.allSettled([a.play(), g.play()])`. Check the backing
result for rejection (the guide is optional, swallow its failure).
