import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { chromium } from "playwright";

const port = Number(process.env.TRACK_PREP_TEST_PORT ?? 4320);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  "pnpm",
  ["--filter", "@workspace/gravelkingpro", "run", "dev"],
  {
    cwd: process.cwd(),
    env: { ...process.env, BASE_PATH: "/", PORT: String(port), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function writeAscii(buffer, offset, value) {
  buffer.write(value, offset, "ascii");
}

function createFixtureWav(durationSeconds, frequency) {
  const sampleRate = 44_100;
  const channelCount = 1;
  const bytesPerSample = 2;
  const frameCount = sampleRate * durationSeconds;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  writeAscii(wav, 0, "RIFF");
  wav.writeUInt32LE(36 + dataSize, 4);
  writeAscii(wav, 8, "WAVE");
  writeAscii(wav, 12, "fmt ");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  wav.writeUInt16LE(channelCount * bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  writeAscii(wav, 36, "data");
  wav.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.sin((2 * Math.PI * frequency * frame) / sampleRate) * 0.15;
    wav.writeInt16LE(Math.round(sample * 0x7fff), 44 + frame * bytesPerSample);
  }
  return wav;
}

function stopServer() {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // The server may already have exited after a failed startup.
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/studio/track-prep`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`track prep browser test server did not start:\n${serverOutput}`);
}

async function loadFixture(page, inputIndex, name, buffer) {
  await page.locator('input[type="file"]').nth(inputIndex).setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer,
  });
  await page.getByText(name, { exact: true }).waitFor();
}

async function getOffset(page) {
  return page.locator("output").filter({ hasText: "OFFSET:" }).innerText();
}

function assertOffset(actual, expected) {
  assert.equal(actual, `OFFSET: ${expected}`, `guide offset changed unexpectedly: ${actual}`);
}

async function run() {
  await waitForServer();
  let executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (!executablePath) {
    try {
      executablePath = execFileSync("sh", ["-c", "command -v chromium"], { encoding: "utf8" }).trim();
    } catch {
      executablePath = undefined;
    }
  }

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  const instrument = createFixtureWav(4, 220);
  const guide = createFixtureWav(2, 440);

  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const trace = {
        starts: [],
        stops: [],
        connections: [],
      };
      window.__trackPrepAudioTrace = trace;

      const sourceIds = new WeakMap();
      let nextSourceId = 1;
      const originalCreateBufferSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = originalCreateBufferSource.apply(this, args);
        sourceIds.set(source, nextSourceId);
        nextSourceId += 1;
        return source;
      };

      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        trace.starts.push({
          id: sourceIds.get(this),
          duration: this.buffer?.duration ?? null,
          when: args[0] ?? 0,
          offset: args[1] ?? 0,
        });
        return originalStart.apply(this, args);
      };

      const originalStop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop = function (...args) {
        trace.stops.push({ id: sourceIds.get(this) });
        return originalStop.apply(this, args);
      };

      const originalConnect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (destination, ...args) {
        trace.connections.push({
          from: this.constructor.name,
          to: destination?.constructor?.name ?? "unknown",
        });
        return originalConnect.call(this, destination, ...args);
      };
    });

    await page.goto(`${baseUrl}/studio/track-prep`);
    await page.getByText("Track & Lyric Prep", { exact: true }).waitFor();

    await loadFixture(page, 0, "instrumental-fixture.wav", instrument);
    await loadFixture(page, 1, "guide-fixture.wav", guide);
    assertOffset(await getOffset(page), "+0.000s");

    await page.getByRole("button", { name: "−5s", exact: true }).click();
    assertOffset(await getOffset(page), "-5.000s");
    await page.getByRole("button", { name: "−1s", exact: true }).click();
    assertOffset(await getOffset(page), "-6.000s");
    await page.getByRole("button", { name: "−50ms", exact: true }).click();
    assertOffset(await getOffset(page), "-6.050s");
    await page.getByRole("button", { name: "+50ms", exact: true }).click();
    assertOffset(await getOffset(page), "-6.000s");
    await page.getByRole("button", { name: "+1s", exact: true }).click();
    assertOffset(await getOffset(page), "-5.000s");
    await page.getByRole("button", { name: "+5s", exact: true }).click();
    assertOffset(await getOffset(page), "+0.000s");

    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: "+5s", exact: true }).click();
    }
    assertOffset(await getOffset(page), "+15.000s");
    await page.getByRole("button", { name: "+5s", exact: true }).click();
    assertOffset(await getOffset(page), "+15.000s");

    for (let index = 0; index < 6; index += 1) {
      await page.getByRole("button", { name: "−5s", exact: true }).click();
    }
    assertOffset(await getOffset(page), "-15.000s");
    await page.getByRole("button", { name: "−5s", exact: true }).click();
    assertOffset(await getOffset(page), "-15.000s");

    await page.getByRole("button", { name: "0.000s Reset", exact: true }).click();
    assertOffset(await getOffset(page), "+0.000s");

    await page.getByRole("button", { name: "Play both", exact: true }).click();
    await page.getByRole("button", { name: "Pause both", exact: true }).waitFor();
    await page.waitForTimeout(120);
    const beforeNudge = await page.evaluate(() => structuredClone(window.__trackPrepAudioTrace));
    const beforeInstrumentalStarts = beforeNudge.starts.filter((start) => Math.abs(start.duration - 4) < 0.01);
    const beforeGuideStarts = beforeNudge.starts.filter((start) => Math.abs(start.duration - 2) < 0.01);
    assert.equal(beforeInstrumentalStarts.length, 1, "playback did not start exactly one instrumental source");
    assert.equal(beforeGuideStarts.length, 1, "playback did not start exactly one guide source");

    await page.getByRole("button", { name: "+50ms", exact: true }).click();
    await page.waitForTimeout(50);
    const afterNudge = await page.evaluate(() => structuredClone(window.__trackPrepAudioTrace));
    const afterInstrumentalStarts = afterNudge.starts.filter((start) => Math.abs(start.duration - 4) < 0.01);
    const afterGuideStarts = afterNudge.starts.filter((start) => Math.abs(start.duration - 2) < 0.01);
    assert.equal(afterInstrumentalStarts.length, 1, "nudging the guide restarted the instrumental timeline");
    assert.equal(afterGuideStarts.length, 2, "nudging the guide did not reschedule its source");
    assert(afterNudge.stops.some((stop) => stop.id === afterGuideStarts[0].id), "old guide source was not stopped");
    assert(afterGuideStarts[1].when > afterGuideStarts[0].when, "rescheduled guide source was not scheduled later");
    assert(afterNudge.connections.some(
      (connection) => connection.from === "DynamicsCompressorNode" && connection.to === "AudioDestinationNode",
    ), "limiter is not connected to the browser output");

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.reload();
    await page.getByText("Track & Lyric Prep", { exact: true }).waitFor();
    await loadFixture(page, 0, "instrumental-only-fixture.wav", instrument);
    await page.getByRole("button", { name: "Play both", exact: true }).click();
    await page.getByRole("button", { name: "Pause both", exact: true }).waitFor();
    await page.waitForTimeout(50);
    const noGuide = await page.evaluate(() => structuredClone(window.__trackPrepAudioTrace));
    assert.equal(noGuide.starts.length, 1, "no-guide playback created an unexpected audio source");
    assert(noGuide.connections.some(
      (connection) => connection.from === "GainNode" && connection.to === "GainNode",
    ), "instrumental mixer was not connected to the master gain");
    assert(noGuide.connections.some(
      (connection) => connection.from === "GainNode" && connection.to === "DynamicsCompressorNode",
    ), "master gain was not connected to the limiter");
    assert(noGuide.connections.some(
      (connection) => connection.from === "DynamicsCompressorNode" && connection.to === "AudioDestinationNode",
    ), "no-guide mixer/limiter graph is not connected to the browser output");

    console.log("Track Prep guide-sync regression passed (offset clamps, live guide reschedule, no-guide limiter graph)");
  } finally {
    await browser.close();
  }
}

try {
  await run();
} finally {
  stopServer();
}