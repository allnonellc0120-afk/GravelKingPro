---
name: Replicate separation provider
description: How Replicate Demucs is wired as the primary audio separation engine, with DSP fallback invariants.
---

## Files
- `artifacts/api-server/src/replicateClient.ts` — shared HTTP client (file upload, createPrediction new-style endpoint, pollPrediction with backoff)
- `artifacts/api-server/src/replicateDemucs.ts` — `replicateVoiceRemove` + `replicateStemSplit` using `ryan5453/demucs` htdemucs

## Priority chain (voice_remove)
Replicate Demucs → UVR (Node Auditor fallback only) → DSP mlkVocalRemoval

## Priority chain (stem_split)
Replicate Demucs → DSP mlkStemSplit

## Key invariants
- **Never crashes**: all Replicate errors are caught in the route; DSP fallback always produces a valid response.
- **Carve via applyMLKv3Fast only**: NEVER call JS applyMLKv3 on downloaded stems — it OOMs the shared Node process on large files in prod. applyMLKv3Fast returns `{ buf: Buffer, parity: string }`.
- **TS 5.9 Buffer cast**: `new Blob([new Uint8Array(buf)], ...)` — plain `buf` fails with ArrayBufferLike incompatibility.
- **Files API upload**: `POST /v1/files` with `Authorization: Token <token>` (not Bearer), multipart body. Returns `{ urls: { get: "..." } }`.
- **New-style prediction**: `POST /v1/models/ryan5453/demucs/predictions` — no version hash needed; input has `{ audio: url, model: "htdemucs", two_stems: "vocals", output_format: "wav" }` for voice_remove; omit `two_stems` for 4-stem.
- **Stem URL keys for voice_remove**: look for `no_vocals` first, then `accompaniment`, `no_vocal`, `instrumental`.
- **Timeout**: voice_remove 240s, stem_split 300s.

**Why:** CPU neural separation OOMs/fakes results in prod; local Demucs Python runner not in deploy image; Replicate is pure HTTPS with no deploy-image cost.

**How to apply:** `replicateIsConfigured()` checks `process.env.REPLICATE_API_TOKEN`; if falsy the whole Replicate path is skipped and DSP runs directly.
