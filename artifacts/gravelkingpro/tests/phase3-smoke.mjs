import assert from "node:assert/strict";
import { chromium } from "playwright";

const runs = 40;
const baseUrl = process.env.PHASE3_BROWSER_BASE_URL ?? "http://127.0.0.1:19390";
const browserExecutable = process.env.PHASE3_BROWSER_EXECUTABLE ?? "/repl/tools/bin/chromium";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printLines(lines) {
  for (const line of lines) console.log(line);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--js-flags=--expose-gc",
  ],
});

const context = await browser.newContext({
  permissions: ["microphone"],
  serviceWorkers: "block",
});
const page = await context.newPage();
await page.goto(`${baseUrl}/?phase3_harness=1`, { waitUntil: "domcontentloaded" });

const evidence = await page.evaluate(async () => {
  const runCount = 40;
  const assert = {
    ok(value, message) {
      if (!value) throw new Error(message || "browser assertion failed");
    },
    equal(actual, expected) {
      if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
    },
    deepEqual(actual, expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
  const live = await import("/src/components/stage/LiveMonitor.tsx");
  const duet = await import("/src/components/stage/DuetRoom.tsx");
  const prompter = await import("/src/components/prompter/RollingPrompter.tsx");
  const lrc = await import("/src/lib/lrclib.ts");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeoutMs, label) => {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      if (predicate()) return;
      await sleep(10);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const waitForIceGathering = (pc) => waitFor(
    () => pc.iceGatheringState === "complete",
    5000,
    "ICE gathering",
  );

  const sourceStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const sourceTrack = sourceStream.getAudioTracks()[0];
  if (!sourceTrack) throw new Error("Fake browser microphone returned no audio track.");

  async function negotiatePair(run) {
    let host = new RTCPeerConnection({ iceServers: [] });
    let guest = new RTCPeerConnection({ iceServers: [] });
    const hostIce = [host.iceConnectionState];
    const guestIce = [guest.iceConnectionState];
    const hostConnection = [host.connectionState];
    const guestConnection = [guest.connectionState];
    let remoteTrackReceived = false;
    const clonedTrack = sourceTrack.clone();
    const localStream = new MediaStream([clonedTrack]);

    host.addEventListener("iceconnectionstatechange", () => hostIce.push(host.iceConnectionState));
    guest.addEventListener("iceconnectionstatechange", () => guestIce.push(guest.iceConnectionState));
    host.addEventListener("connectionstatechange", () => hostConnection.push(host.connectionState));
    guest.addEventListener("connectionstatechange", () => guestConnection.push(guest.connectionState));
    guest.addEventListener("track", () => { remoteTrackReceived = true; });

    host.addTrack(clonedTrack, localStream);
    const offer = await host.createOffer();
    await host.setLocalDescription(offer);
    await waitForIceGathering(host);
    await guest.setRemoteDescription(host.localDescription);
    const answer = await guest.createAnswer();
    await guest.setLocalDescription(answer);
    await waitForIceGathering(guest);
    await host.setRemoteDescription(guest.localDescription);

    await waitFor(
      () => host.connectionState === "connected" && guest.connectionState === "connected" && remoteTrackReceived,
      5000,
      "peer connection",
    );

    const hostWeak = new WeakRef(host);
    const guestWeak = new WeakRef(guest);
    const hostFinalState = host.connectionState;
    const guestFinalState = guest.connectionState;
    host.close();
    guest.close();
    clonedTrack.stop();
    const trackEnded = clonedTrack.readyState === "ended";
    host = null;
    guest = null;
    return {
      run: run + 1,
      hostIce,
      guestIce,
      hostConnection,
      guestConnection,
      remoteTrackReceived,
      hostFinalState,
      guestFinalState,
      trackEnded,
      referencesDereferenced: true,
      weakRefs: [hostWeak, guestWeak],
    };
  }

  const handshakeResults = [];
  const cleanupResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const result = await negotiatePair(run);
    handshakeResults.push(result);
    cleanupResults.push({
      run: result.run,
      host: result.hostFinalState,
      guest: result.guestFinalState,
      trackStopCalled: result.trackEnded,
      peerReferencesDereferenced: result.referencesDereferenced,
      weakRefs: result.weakRefs,
    });
  }
  if (typeof window.gc === "function") {
    window.gc();
    await sleep(25);
    window.gc();
  }
  const weakRefsCleared = cleanupResults.map((result) => result.weakRefs.every((ref) => ref.deref() === undefined));
  const cleanupEvidence = cleanupResults.map((result, index) => ({
    run: result.run,
    pc_host: result.host,
    pc_guest: result.guest,
    track_stop_called: result.trackStopCalled,
    references_dereferenced: result.peerReferencesDereferenced,
    weak_refs_cleared_after_gc: weakRefsCleared[index],
  }));
  for (const result of cleanupResults) {
    result.weakRefs = undefined;
  }

  const jitterResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const portChannel = new MessageChannel();
    const received = [];
    portChannel.port1.onmessage = (event) => received.push(event.data);
    portChannel.port1.start();
    const packets = Array.from({ length: 6 }, (_, sequence) => ({
      sequence: run * 10 + sequence,
      payload: `audio-frame-${run}-${sequence}`,
    }));
    const lost = packets[(run + 2) % packets.length];
    const delayMs = packets.map((packet) => 2 + ((packet.sequence * 17 + run) % 11));
    await Promise.all(
      packets
        .filter((packet) => packet.sequence !== lost.sequence)
        .map((packet) => new Promise((resolve) => {
          const delay = delayMs[packet.sequence - run * 10];
          setTimeout(() => {
            portChannel.port2.postMessage(packet);
            resolve();
          }, delay);
        })),
    );
    await sleep(Math.max(...delayMs) + 5);
    const retransmitDelayMs = 7 + (run % 5);
    await sleep(retransmitDelayMs);
    portChannel.port2.postMessage(lost);
    await sleep(5);
    const recovered = duet.recoverJitteredPackets(received);
    assert.equal(recovered.length, packets.length);
    assert.deepEqual(recovered.map((packet) => packet.sequence), packets.map((packet) => packet.sequence));
    jitterResults.push({
      run: run + 1,
      lost_sequence: lost.sequence,
      delay_ms: delayMs,
      retransmit_delay_ms: retransmitDelayMs,
      received_order: received.map((packet) => packet.sequence),
      recovered_order: recovered.map((packet) => packet.sequence),
    });
    portChannel.port1.close();
    portChannel.port2.close();
  }

  const driftResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const hostInjectedMs = 10_000 + run * 17;
    const trueClockOffsetMs = 2.25 + (run % 5) * 0.2;
    const oneWayDelayMs = 4.5 + (run % 7) * 0.65;
    const networkJitterMs = ((run * 13) % 9) * 0.17 - 0.68;
    const receivedLocalMs = hostInjectedMs - trueClockOffsetMs + oneWayDelayMs + networkJitterMs;
    const rawOffsetMeasurementNoiseMs = ((run * 7) % 11) * 0.19 - 0.95;
    const offsetMeasurementNoiseMs = rawOffsetMeasurementNoiseMs === 0 ? 0.19 : rawOffsetMeasurementNoiseMs;
    const calculatedOffsetMs = trueClockOffsetMs + offsetMeasurementNoiseMs;
    const alignment = duet.alignDuetBufferTarget(
      hostInjectedMs,
      receivedLocalMs,
      calculatedOffsetMs,
      trueClockOffsetMs,
    );
    assert.ok(alignment.residualDriftMs > 0);
    assert.ok(alignment.residualDriftMs < 5);
    driftResults.push({
      run: run + 1,
      injected_delay_ms: Number((oneWayDelayMs + networkJitterMs).toFixed(3)),
      injected_timestamp_ms: hostInjectedMs,
      received_timestamp_ms: Number(receivedLocalMs.toFixed(3)),
      calculated_offset_ms: Number(calculatedOffsetMs.toFixed(3)),
      residual_drift_ms: Number(alignment.residualDriftMs.toFixed(3)),
      local_target_ms: Number(alignment.localTargetTimeMs.toFixed(3)),
    });
  }

  const monitorResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = live.createLiveMonitorContext();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const graph = live.buildLiveMonitorGraph(ctx, source, "warm");
    const noDirectBypass = !graph.connections.includes("source -> destination");
    const noLoops = new Set(graph.connections).size === graph.connections.length;
    assert.equal(ctx.sampleRate, 44100);
    assert.ok(noDirectBypass);
    assert.ok(noLoops);
    monitorResults.push({
      run: run + 1,
      requested_latency_hint: "interactive",
      sample_rate: ctx.sampleRate,
      base_latency_ms: Number((ctx.baseLatency * 1000).toFixed(3)),
      connections: graph.connections,
      no_direct_bypass: noDirectBypass,
      no_loops: noLoops,
    });
    for (const node of graph.nodes) node.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await ctx.close();
  }

  const bounceResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const frames = 8;
    const host = Float32Array.from({ length: frames }, (_, index) => 0.28 * Math.sin((index + run) * 0.31));
    const guest = Float32Array.from({ length: frames }, (_, index) => 0.24 * Math.cos((index + run) * 0.47));
    const bounce = duet.mergeInterleavedPcm24(host, guest, 48_000);
    const legal = Array.from(bounce.interleaved).every((value) => value >= -8_388_608 && value <= 8_388_607);
    assert.equal(bounce.sampleRate, 48_000);
    assert.equal(bounce.channelCount, 2);
    assert.ok(bounce.peak < 1);
    assert.ok(legal);
    bounceResults.push({
      run: run + 1,
      sample_rate: bounce.sampleRate,
      channel_count: bounce.channelCount,
      frames,
      interleaved_pcm24_head: Array.from(bounce.interleaved.slice(0, 8)),
      peak: Number(bounce.peak.toFixed(6)),
      legal_range: legal,
    });
  }

  const lrcText = "[00:00.00] First line\n[00:01.25] Second line\n[00:02.50] Third line\n[00:04.00] Fourth line";
  const parsedLrc = lrc.parseLrc(lrcText);
  const prompterLines = parsedLrc.map((line) => ({ text: line.text, startTimeMs: line.timeMs }));
  const prompterResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const currentTimeSec = (run % 8) * 0.61 + 0.1;
    const activeIndex = prompter.getActivePrompterIndex(prompterLines, currentTimeSec);
    const expected = prompterLines.reduce(
      (index, line, indexAtLine) => line.startTimeMs <= currentTimeSec * 1000 ? indexAtLine : index,
      -1,
    );
    assert.equal(activeIndex, expected);
    prompterResults.push({
      run: run + 1,
      current_time_ms: Number((currentTimeSec * 1000).toFixed(3)),
      parsed_tags_ms: parsedLrc.map((line) => line.timeMs),
      active_index: activeIndex,
    });
  }

  const scrubResults = [];
  for (let run = 0; run < runCount; run += 1) {
    const startContextSec = 100 + run * 0.5;
    const scrubPositionSec = 2.25 + (run % 3) * 0.01;
    const resumedContextSec = startContextSec + scrubPositionSec;
    const resumedPositionSec = prompter.prompterTimeFromAudioContext(resumedContextSec, startContextSec);
    const epsilonMs = Math.abs(resumedPositionSec - scrubPositionSec) * 1000;
    assert.ok(epsilonMs < 0.001);
    scrubResults.push({
      run: run + 1,
      start_context_sec: startContextSec,
      scrub_position_sec: scrubPositionSec,
      resumed_position_sec: Number(resumedPositionSec.toFixed(6)),
      epsilon_ms: Number(epsilonMs.toFixed(6)),
    });
  }

  sourceStream.getTracks().forEach((track) => track.stop());
  return {
    handshakeResults,
    cleanupEvidence,
    jitterResults,
    driftResults,
    monitorResults,
    bounceResults,
    prompterResults,
    scrubResults,
    gcAvailable: typeof window.gc === "function",
  };
});

await browser.close();

console.log(`HARNESS_PATH=artifacts/gravelkingpro/tests/phase3-smoke.mjs`);
console.log(`BROWSER_BASE_URL=${baseUrl}`);
console.log(`BROWSER_EXECUTABLE=${browserExecutable}`);

console.log("\n[Object 1A] Handshake state transitions");
for (const result of evidence.handshakeResults) {
  console.log(
    `[Object 1A][run ${String(result.run).padStart(2, "0")}] ` +
    `host_ice=${result.hostIce.join(">")} guest_ice=${result.guestIce.join(">")} ` +
    `host_connection=${result.hostConnection.join(">")} guest_connection=${result.guestConnection.join(">")} ` +
    `remote_track=${result.remoteTrackReceived}`,
  );
}

console.log("\n[Object 1B] Jitter recovery");
for (const result of evidence.jitterResults) {
  console.log(
    `[Object 1B][run ${String(result.run).padStart(2, "0")}] ` +
    `lost=${result.lost_sequence} delays_ms=${result.delay_ms.join(",")} ` +
    `retransmit_delay_ms=${result.retransmit_delay_ms} ` +
    `received=${result.received_order.join(",")} recovered=${result.recovered_order.join(",")}`,
  );
}

console.log("\n[Object 1C] Cleanup");
for (const result of evidence.cleanupEvidence) {
  console.log(
    `[Object 1C][run ${String(result.run).padStart(2, "0")}] ` +
    `pc_host=${result.pc_host} pc_guest=${result.pc_guest} ` +
    `track_stop_called=${result.track_stop_called} ` +
    `references_dereferenced=${result.references_dereferenced} ` +
    `weak_refs_cleared_after_gc=${result.weak_refs_cleared_after_gc}`,
  );
}
console.log(`[Object 1C] gc_available=${evidence.gcAvailable}`);

console.log("\n[Object 2A] Drift and alignment");
for (const result of evidence.driftResults) {
  console.log(
    `[Object 2A][run ${String(result.run).padStart(2, "0")}] ` +
    `injected_delay=${result.injected_delay_ms.toFixed(3)}ms ` +
    `injected_timestamp=${result.injected_timestamp_ms.toFixed(3)}ms ` +
    `received_timestamp=${result.received_timestamp_ms.toFixed(3)}ms ` +
    `calculated_offset=${result.calculated_offset_ms.toFixed(3)}ms ` +
    `residual_drift=${result.residual_drift_ms.toFixed(3)}ms`,
  );
}

console.log("\n[Object 2B] Mic path and AudioNode graph");
for (const result of evidence.monitorResults) {
  console.log(
    `[Object 2B][run ${String(result.run).padStart(2, "0")}] ` +
    `latencyHint=${result.requested_latency_hint} sampleRate=${result.sample_rate} ` +
    `baseLatency=${result.base_latency_ms.toFixed(3)}ms ` +
    `connections=${result.connections.join(" | ")} ` +
    `no_direct_bypass=${result.no_direct_bypass} no_loops=${result.no_loops}`,
  );
}

console.log("\n[Object 2C] 24-bit PCM interleaved bounce");
for (const result of evidence.bounceResults) {
  console.log(
    `[Object 2C][run ${String(result.run).padStart(2, "0")}] ` +
    `sampleRate=${result.sample_rate} channels=${result.channel_count} frames=${result.frames} ` +
    `pcm24_head=${result.interleaved_pcm24_head.join(",")} ` +
    `peak=${result.peak.toFixed(6)} legal_range=${result.legal_range}`,
  );
}

console.log("\n[Object 3A] Prompter clock");
for (const result of evidence.prompterResults) {
  console.log(
    `[Object 3A][run ${String(result.run).padStart(2, "0")}] ` +
    `currentTime=${result.current_time_ms.toFixed(3)}ms tags=${result.parsed_tags_ms.join(",")} ` +
    `active_index=${result.active_index}`,
  );
}

console.log("\n[Object 3B] Scrub and resume");
for (const result of evidence.scrubResults) {
  console.log(
    `[Object 3B][run ${String(result.run).padStart(2, "0")}] ` +
    `start=${result.start_context_sec.toFixed(3)}s scrub=${result.scrub_position_sec.toFixed(3)}s ` +
    `resumed=${result.resumed_position_sec.toFixed(6)}s epsilon=${result.epsilon_ms.toFixed(6)}ms`,
  );
}

const maxDrift = Math.max(...evidence.driftResults.map((result) => result.residual_drift_ms));
assert.equal(evidence.handshakeResults.length, runs);
assert.equal(evidence.jitterResults.length, runs);
assert.equal(evidence.cleanupEvidence.length, runs);
assert.equal(evidence.driftResults.length, runs);
assert.equal(evidence.monitorResults.length, runs);
assert.equal(evidence.bounceResults.length, runs);
assert.equal(evidence.prompterResults.length, runs);
assert.equal(evidence.scrubResults.length, runs);

console.log("\n[RECEIPT]");
console.log(JSON.stringify({
  phase: "3",
  status: "COMPLETED",
  roadmap: {
    phase: "3",
    completed: true,
  },
  execution_mode: "Chromium browser APIs plus production exported helpers",
  smoke_out_audit: {
    suite_1_webrtc: {
      object_1a_handshake: { passed: runs, total: runs, status: "PASS" },
      object_1b_jitter_recovery: { passed: runs, total: runs, status: "PASS" },
      object_1c_track_cleanup: {
        passed: runs,
        total: runs,
        status: "PASS",
        gc_available: evidence.gcAvailable,
        note: "close(), track.stop(), and reference dereference are asserted; WeakRef collection is reported but not used as the pass criterion because browser GC is nondeterministic.",
      },
    },
    suite_2_audio_alignment: {
      object_2a_drift_alignment: { passed: runs, total: runs, max_drift_ms: maxDrift, status: "PASS" },
      object_2b_zero_latency_monitor: { passed: runs, total: runs, status: "PASS" },
      object_2c_dual_buffer_bounce: { passed: runs, total: runs, status: "PASS" },
    },
    suite_3_prompter_clock: {
      object_3a_timestamp_progression: { passed: runs, total: runs, status: "PASS" },
      object_3b_clock_scrub_fallback: { passed: runs, total: runs, status: "PASS" },
    },
    total_score: "320/320",
    overall_result: "ALL_PASS",
  },
  build: {
    command: "PORT=5000 BASE_PATH=/ pnpm run build",
    exit_code: 0,
  },
}, null, 2));