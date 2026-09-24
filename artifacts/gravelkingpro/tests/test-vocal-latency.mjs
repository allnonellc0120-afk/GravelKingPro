import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const recorder = await readFile(new URL("../src/lib/daw/useVocalBoothRecorder.ts", import.meta.url), "utf8");
const monitor = await readFile(new URL("../src/components/live-vocal-monitor.tsx", import.meta.url), "utf8");

assert.match(recorder, /echoCancellation:\s*false/);
assert.match(recorder, /noiseSuppression:\s*false/);
assert.match(recorder, /autoGainControl:\s*false/);
assert.match(recorder, /latency:\s*0/);
assert.match(recorder, /latencyHint:\s*"interactive"/);
assert.match(recorder, /sampleRate:\s*44100/);
assert.match(recorder, /const recordStream:\s*MediaStream\s*=\s*stream/);
assert.doesNotMatch(recorder, /createMediaStreamDestination/);

assert.match(monitor, /const dryGain = ctx\.createGain\(\)/);
assert.match(monitor, /const sendGain = ctx\.createGain\(\)/);
assert.match(monitor, /const wetGain = ctx\.createGain\(\)/);
assert.match(monitor, /source\.connect\(dryGain\)/);
assert.match(monitor, /source\.connect\(sendGain\)/);
assert.match(monitor, /buildEffectChain\(ctx, sendGain, p, wetGain\)/);
assert.match(monitor, /dryGain\.connect\(ctx\.destination\)/);
assert.match(monitor, /wetGain\.connect\(ctx\.destination\)/);
assert.match(monitor, /node\.disconnect\(\)/);
assert.match(monitor, /latencyHint:\s*"interactive"/);
assert.match(monitor, /sampleRate:\s*44100/);

console.log(JSON.stringify({
  suite: "vocal-booth-latency-contract",
  constraints: "raw microphone capture with browser DSP disabled and latency 0",
  audioContext: "interactive / 44100 Hz",
  monitor: "parallel dry and wet aux-send buses",
  recordingTap: "original MediaStream before effects",
  graphCleanup: "disconnects tracked nodes before context close",
  passed: true,
}));