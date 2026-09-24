---
name: Duet partner audio in Web Audio
description: Why the remote WebRTC partner analyser reads silent and how the stage captures real risers headlessly
---
Rule: a remote WebRTC MediaStream must ALSO be attached to a (muted) HTMLAudioElement sink or Chromium never pumps it into `createMediaStreamSource` → analyser/gain stay at 0 (crbug 121673). This is true in headless AND real Chrome.

**Why:** the duet partner riser/HUD glow sat at 0.000 in headless captures until the muted sink was added; afterwards the partner analyser tracked the remote mic for real. Sink is muted so it does not double the audible `gain → destination` path.

**How to apply:** keep the sink + idempotent detach (pause, srcObject=null, disconnect nodes) on reconnect/peer-left/unmount. Physical-browser verification is still worth doing for iOS.
