---
name: JAX speech session isolation
description: Browser speech recognition can emit cumulative or late results after stop, so each microphone session needs an invalidation token.
---

Every JAX microphone session must have its own generation token. Increment the token before stopping recognition or sending a message, and ignore `onresult`, `onerror`, and `onend` callbacks from older sessions. Prefer one-shot recognition for iOS/Safari stability; continuous recognition can keep stale transcript state alive across messages.

**Why:** On mobile Safari, stopping recognition does not guarantee that already queued cumulative result events will not fire. Without invalidation, a second spoken prompt can include the first prompt again and repopulate a composer that was just cleared.

**How to apply:** Any future speech-input refactor must invalidate the active session before send/stop and only allow callbacks whose token matches the current session.