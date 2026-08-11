---
name: Generation drops unmastered tracks
description: Product rule — AI generation/remix never auto-masters; mastering is a separate paid step
---

**Rule:** `generateAndMasterTrack` (and therefore remix) does NOT run the MLK kernel. The normalized, cert-embedded generated mix is vaulted as-is (`kernelEngine: "unmastered"`) and the user lands in the Mastering Tool with it preloaded and playable, exactly like an uploaded song. Mastering is a separate, user-initiated paid step there.

**Why:** Owner directive (2026-08-11): mastering is a separate charge; bundling it broke the flow and doubled cost per generation. This supersedes "MLK v3 on every audio process" for the *generation* pipeline only — upload/mastering routes still carve through MLK v3.

**How to apply:** Never reintroduce `runMlkKernel` into the generation path. The IP cert still binds to the pre-kernel generated mix (unchanged). Copy in songwriting UI must say "unmastered → you choose when to master."

**Related fix:** vault/track routes (`resolveSessionUser` in tracks.ts) must check OIDC (`req.isAuthenticated()`) BEFORE the `gk_session` cookie — OIDC users never carry that cookie and were getting 401 on the mastering preload (same bug class as the subscription-status fix).
