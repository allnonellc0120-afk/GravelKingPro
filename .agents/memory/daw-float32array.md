---
name: DAW Float32Array TypeScript types
description: TypeScript 5.9 makes Float32Array generic; Web Audio API returns Float32Array<ArrayBufferLike> but many functions expect Float32Array<ArrayBuffer>
---

**Rule:** When passing `AudioBuffer.getChannelData()` to functions expecting `Float32Array<ArrayBuffer>`, wrap with `new Float32Array(buffer.getChannelData(ch))` to create an ArrayBuffer-backed copy.

**Why:** TypeScript 5.9 added generics to typed arrays. `AudioBuffer.getChannelData()` returns `Float32Array<ArrayBufferLike>`, which is not assignable to `Float32Array<ArrayBuffer>`. Also, `WaveShaperNode.curve` expects `Float32Array<ArrayBuffer>` — distortion curve functions must annotate their return type explicitly as `Float32Array<ArrayBuffer>`.

**How to apply:** In any lib/daw code that calls `getChannelData()` and passes the result to a typed function, wrap with `new Float32Array(...)`.
