---
name: MLK v3 applies to every audio process
description: MLK v3 is always-on across all audio routes; rules for remote routing and buffered carving
---

MLK v3 (the multi-band Morris Law Kernel) runs on EVERY audio process, not just
voice/stem separation: mastering, DAW/studio mix export, and standard processing
all carve their output through it. The shared exported helper is
`applyMLKv3(wavBuf, multiplier=0.75) -> { buf, parity }` in `kernel-v3.ts`
(alongside `parseWav`/`buildWavHeader`/`mlk_v3`); the separator imports it. Every
audio response should carry an `X-GK-Kernel: MLK_v3` marker.

**Remote standard kernel is the canonical MLK v3 processor.**
The standard-mode remote path (`REMOTE_KERNEL_URL` `/process-audio`) already
applies MLK v3 server-side and returns `X-GK-Parity`. The local `mlk_v3` path is
the FALLBACK only.
**Why:** re-running `applyMLKv3` on a remote result would double-process (degrade
audio + add latency) for no benefit.
**How to apply:** never re-carve remote output; just mark `X-GK-Kernel` (default
`MLK_v3`, let a remote-provided value win) so the marker is uniform across local
and remote responses.

**Any route that buffers a whole WAV through `applyMLKv3` must bound total output
duration/size.**
`applyMLKv3` reads the full file and expands it into JS number arrays (plus band
copies), so a multi-hour WAV can OOM the API. Per-track duration limits are NOT
enough: studio-mix can concat up to 8 tracks (sequential), and speeds below 1.0
lengthen output (output ≈ input / speed), so combined output can dwarf any single
track. Master/separator are safe because they process a single ≤`MAX_AUDIO_DURATION_S`
file.
**Why:** the buffered carve replaced studio-mix's old streaming response, which
was memory-bounded regardless of length.
**How to apply:** before `readFile` + `applyMLKv3` on a multi-input route, project
the output duration (sequential→sum, layer→max, then ÷ speed) and reject with the
existing 422 contract if it exceeds `MAX_AUDIO_DURATION_S`.
