import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/gka-monitor-worklet.js", import.meta.url), "utf8");

function loadProcessor() {
  let Processor;
  class AudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, messages: [], postMessage(message) { this.messages.push(message); } };
    }
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor,
    currentFrame: 0,
    sampleRate: 48000,
    registerProcessor(_name, processor) { Processor = processor; },
    Math,
  });
  return Processor;
}

test("GKA worklet applies finite bounded saturation and a tracked subharmonic", () => {
  const Processor = loadProcessor();
  const processor = new Processor({ processorOptions: { saturation: 0.5, subharmonic: 0.1 } });
  const input = new Float32Array(128);
  for (let i = 0; i < input.length; i += 1) input[i] = 0.7 * Math.sin((2 * Math.PI * 220 * i) / 48000);

  const output = new Float32Array(128);
  assert.equal(processor.process([[input]], [[output]]), true);
  const nextInput = new Float32Array(128);
  for (let i = 0; i < nextInput.length; i += 1) nextInput[i] = 0.7 * Math.sin((2 * Math.PI * 220 * (i + 128)) / 48000);
  const nextOutput = new Float32Array(128);
  assert.equal(processor.process([[nextInput]], [[nextOutput]]), true);
  const outputSamples = [...output, ...nextOutput];
  assert.ok(outputSamples.some((sample, index) => Math.abs(sample - (index < 128 ? input[index] : nextInput[index - 128])) > 0.01));
  assert.ok(outputSamples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 0.98));
  assert.ok(processor.lastPeriodSamples > 0, "fundamental crossings should be tracked for octave-down synthesis");
});

test("GKA worklet silences and reports render quanta above 256 samples", () => {
  const Processor = loadProcessor();
  const processor = new Processor({ processorOptions: { saturation: 0.2, subharmonic: 0.05 } });
  const output = new Float32Array(257).fill(0.5);

  assert.equal(processor.process([[new Float32Array(257)]], [[output]]), false);
  assert.ok([...output].every((sample) => sample === 0));
  assert.equal(processor.port.messages[0]?.type, "quantum-overflow");
  assert.equal(processor.port.messages[0]?.samples, 257);
});

test("GKA octave-down component is generated only from a tracked, audible fundamental", () => {
  const Processor = loadProcessor();
  const withSub = new Processor({ processorOptions: { saturation: 0, subharmonic: 0.15 } });
  const dry = new Processor({ processorOptions: { saturation: 0, subharmonic: 0 } });
  let withSubOutput;
  let dryOutput;

  for (let block = 0; block < 3; block += 1) {
    const input = new Float32Array(128);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = 0.5 * Math.sin((2 * Math.PI * 220 * (block * 128 + i)) / 48000);
    }
    withSubOutput = new Float32Array(128);
    dryOutput = new Float32Array(128);
    withSub.process([[input]], [[withSubOutput]]);
    dry.process([[input]], [[dryOutput]]);
  }
  assert.ok(withSub.lastPeriodSamples > 0);
  assert.ok(withSubOutput.some((sample, index) => Math.abs(sample - dryOutput[index]) > 0.01));

  const silence = new Float32Array(128).fill(0);
  for (let block = 0; block < 300; block += 1) {
    withSubOutput = new Float32Array(128);
    withSub.process([[silence]], [[withSubOutput]]);
  }
  assert.ok(Math.max(...withSubOutput.map(Math.abs)) < 0.001, "silence must not sustain an oscillator");
});