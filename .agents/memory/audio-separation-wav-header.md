---
name: Audio separation & WAV header handling
description: How voice removal / stem split process audio, and the ffmpeg-WAV-header landmine that corrupts in-process PCM edits.
---

# Audio separation (voice_remove / stem_split)

These studio modes run a **fast in-process Morris Law Kernel v3 (MLK v3) DSP path**, not the heavy neural separator. The MLK path uses ffmpeg filters (stereo center-channel cancellation for voice removal; band/spatial filters for the 5 stems vocals/drums/bass/other/instrumental) and then the MLK v3 kernel. It completes in seconds.

**Why:** The Demucs/`htdemucs` neural path (the `gns*` functions) stalls or OOMs on this machine, so requests used to hang forever while the frontend's fake progress bar sat at "88%". The neural code is left in place but is **dead** — no hot route imports it. Do not reintroduce it on the request path.

**Voice removal is local-only on purpose.** Separation is an inherently local ffmpeg operation; the remote kernel endpoint (`REMOTE_KERNEL_URL`) is a *generic* `/process-audio` kernel with no separation contract. Routing raw audio there would silently return a non-separated mix while reporting `routing: remote`. Standard (non-separation) mode still does cloud-first → local, which is where the MLK v3 "cloud" route lives.

## WAV header landmine (the real bug behind the hang fix)

**Never assume a fixed 44-byte WAV header when editing PCM of an ffmpeg-produced WAV.** ffmpeg can write a `LIST`/metadata chunk before (or after) the `data` chunk, so the `data` payload is **not** at byte 44. The old code took `subarray(0,44)` as header and overwrote byte 40 as the data size, which buried/corrupted the real `data` chunk → downstream ffmpeg failed with `no 'data' tag found` / `Invalid data found when processing input`.

**How to apply:** When manipulating raw PCM of any ffmpeg WAV, walk the RIFF chunks to locate `fmt ` and `data` explicitly, then rebuild a canonical 44-byte PCM header from the parsed channels/sampleRate/bitsPerSample + new data size. Chunks are word-aligned (pad odd sizes to even). This lives in `applyMLKv3`'s `parseWav`/`buildWavHeader` in `gkp-separator.ts`.
