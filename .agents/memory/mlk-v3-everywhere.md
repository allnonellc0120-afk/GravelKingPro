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

**Production route carves MUST use the ffmpeg-native `applyMLKv3Fast`, never the
sync JS kernel.**
`mlk_v3` → `gravelking_opt` builds throwaway `nested`/`carved` `number[][]` arrays
over ALL samples, once per band (×3). On a real multi-minute song that is multiple
GB of tiny JS allocations → V8 OOM → the SINGLE shared Node process is
SIGTERM/SIGKILLed → every in-flight request (including the already-fast ffmpeg
separators in `audio.ts`) hangs forever and healthchecks 500. This reproduced
ONLY in production: dev had enough headroom and test fixtures were short.
**Why:** master.ts + studio-mix.ts used to `readFile` the whole output and run the
JS kernel; the heap blow-up was the real cause of the "all separators hang in
prod" bug, even though the separators themselves were innocent collateral.
**How to apply:** route output carving goes through
`applyMLKv3Fast(input: string|Buffer, multiplier)` (kernel-v3.ts), which does the
3-band MLK v3 carve entirely in ffmpeg (asplit=3 → per-band lowpass/highpass +
volume → amix → dynaudnorm), streaming on disk with near-zero heap and returns
`{ buf, parity: "MLK_V3_VALIDATED" }`. The JS `gravelking_opt` now takes
`buildSlices` (default true for the bounded `/kernel/process` demo); `mlk_v3`
passes `false` to skip the slice arrays. The sync JS `applyMLKv3` survives only on
the dead Demucs GNS path — convert it too before ever mounting that path.

**Stem split = one independent ffmpeg process PER stem (parallel), MLK baked into
each stem's own filter graph.**
`mlkStemSplit` renders each of the 5 stems (vocals, drums, bass, other,
instrumental) in its own `ffmpeg` call: `[0:a]<extraction>[x];[x]<mlkChain>` where
mlkChain is the inline asplit=3→per-band gain→amix→dynaudnorm carve (NOT
`applyMLKv3Fast`, NOT the JS kernel). Runs via `Promise.allSettled` so a failure
isolates to ONE stem; the thrown error names every failed stem + the first ffmpeg
error.
**Why:** user explicitly wanted per-stem processes so they can tell WHICH stem
failed; a single combined-ffmpeg call produced all stems but gave no per-stem
attribution. Each ffmpeg streams source→disk so only the final zip is in heap
(preserves the OOM fix).
**How to apply:** ffmpeg filter labels (`[l][m][h][out]` etc.) are scoped per
process, so reusing the same labels across the 5 stem processes is safe — do NOT
reintroduce per-stem label prefixes. Keep extraction filters and channel counts
(vocals mono; instrumental stereo via `pan=stereo|c0=c0-c1|c1=c1-c0`, mono via
aecho) intact.
