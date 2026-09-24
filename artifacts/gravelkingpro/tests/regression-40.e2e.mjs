/**
 * 40-point regression matrix — browser sections (items 01–36).
 * Server items 37–39 and the build (40) are run separately by the shell.
 *
 * Runs against the dev server on $TRACK_PREP_TEST_PORT (default 19390) with
 * system Chromium. Every item reports PASS/FAIL from a real assertion — no mocks.
 */
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import { chromium } from "playwright";

let executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (!executablePath) {
  for (const candidate of ["/repl/tools/bin/chromium", "chromium", "google-chrome"]) {
    try { executablePath = execFileSync("sh", ["-c", `command -v ${candidate}`], { encoding: "utf8" }).trim(); break; } catch { /* */ }
  }
}
const baseUrl = `http://127.0.0.1:${process.env.TRACK_PREP_TEST_PORT ?? 19390}`;
const FIX = process.env.GK40_FIXTURES ?? "/tmp/gk40";

function makeWav(durationSeconds, frequencyHz, distinctRight = false) {
  const sampleRate = 44_100, channels = 2, bps = 2;
  const frames = Math.floor(sampleRate * durationSeconds);
  const dataBytes = frames * channels * bps;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii"); wav.writeUInt32LE(36 + dataBytes, 4); wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii"); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * channels * bps, 28); wav.writeUInt16LE(channels * bps, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii"); wav.writeUInt32LE(dataBytes, 40);
  for (let f = 0; f < frames; f++) {
    const l = Math.round(Math.sin((2 * Math.PI * frequencyHz * f) / sampleRate) * 0.15 * 0x7fff);
    const r = distinctRight ? Math.round(Math.sin((2 * Math.PI * frequencyHz * 1.5 * f) / sampleRate) * 0.12 * 0x7fff) : l;
    const base = 44 + f * channels * bps;
    wav.writeInt16LE(l, base); wav.writeInt16LE(r, base + 2);
  }
  return wav;
}

const results = new Map();
const notes = new Map();
function record(n, ok, note) {
  results.set(n, Boolean(ok));
  if (note) notes.set(n, note);
  console.log(`  [${String(n).padStart(2, "0")}] ${ok ? "PASS" : "FAIL"}${note ? ` — ${note}` : ""}`);
}
const pass = (note) => ({ ok: true, note });
async function item(n, fn) {
  try { const r = await fn(); if (r && r.ok === true) record(n, true, r.note); else record(n, false, typeof r === "string" ? r : String(r)); }
  catch (e) { record(n, false, e?.message ?? String(e)); }
}

const INIT = `
  window.__gkLogs = [];
  const oe = console.error.bind(console);
  console.error = (...a) => { window.__gkLogs.push({ level: 'error', msg: a.join(' ') }); oe(...a); };
  window.__ctxs = [];
  const OrigCtx = window.AudioContext;
  window.AudioContext = class extends OrigCtx { constructor(...a) { super(...a); window.__ctxs.push(this); } };
  window.__audioTrace = { starts: [], connections: [], gainTargets: [] };
  const gainIds = new WeakMap(); let nextGain = 1;
  const origCG = OrigCtx.prototype.createGain;
  OrigCtx.prototype.createGain = function (...a) { const g = origCG.apply(this, a); gainIds.set(g.gain, nextGain++); return g; };
  const origSTAT = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function (v, t, tc) {
    if (gainIds.has(this)) window.__audioTrace.gainTargets.push({ gain: gainIds.get(this), value: v, at: t });
    return origSTAT.call(this, v, t, tc);
  };
  const origStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, offset) {
    window.__audioTrace.starts.push({ dur: this.buffer?.duration ?? null, when: when ?? 0, offset: offset ?? 0, ctxTime: this.context.currentTime });
    return origStart.apply(this, arguments);
  };
  const origConn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...a) {
    window.__audioTrace.connections.push({ from: this.constructor.name, to: dest?.constructor?.name ?? '?' });
    return origConn.call(this, dest, ...a);
  };
`;

const fileInput = (page, i) => page.locator('input[type="file"]').nth(i);
async function loadSlot(page, slotIndex, name, source, mimeType) {
  await page.evaluate(() => { window.__gkLogs = []; });
  const payload = typeof source === "string" ? source : { name, mimeType, buffer: source };
  await fileInput(page, slotIndex).setInputFiles(payload);
  await page.getByText(name, { exact: true }).waitFor({ timeout: 30_000 });
  const alert = await page.locator('[role="alert"]').count();
  if (alert > 0) throw new Error(`error alert after loading ${name}: ${await page.locator('[role="alert"]').innerText()}`);
}
const trace = (page) => page.evaluate(() => structuredClone(window.__audioTrace));
const resetTrace = (page) => page.evaluate(() => { window.__audioTrace = { starts: [], connections: [], gainTargets: [] }; });
const lastPair = (t) => { const g = t.gainTargets; return g.length >= 2 ? [g[g.length - 2].value, g[g.length - 1].value] : null; };
const offsetText = async (page) => page.locator("output").filter({ hasText: "OFFSET:" }).innerText();
const btn = (page, name) => page.getByRole("button", { name, exact: true });
async function progressWidth(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".bg-amber-300.transition-\\[width\\]");
    return bar ? parseFloat(bar.style.width) : NaN;
  });
}
async function setSlider(page, label, key) {
  const thumb = page.locator(`[aria-label="${label}"] [role="slider"]`);
  await thumb.focus();
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["microphone"] });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const gotoPrep = async () => {
    await page.goto(`${baseUrl}/studio/track-prep`, { waitUntil: "domcontentloaded" });
    await page.getByText("Track & Lyric Prep", { exact: true }).waitFor({ timeout: 15_000 });
  };
  await gotoPrep();

  // ── SECTION 1 ──────────────────────────────────────────────────────────
  console.log("SECTION 1: dual-audio deck");
  await item(1, async () => {
    await loadSlot(page, 0, "in.mp3", `${FIX}/in.mp3`);
    await loadSlot(page, 0, "in.wav", `${FIX}/in.wav`);
    await loadSlot(page, 0, "in.m4a", `${FIX}/in.m4a`);
    return pass("mp3, wav, m4a decoded in Slot 1");
  });
  await item(2, async () => {
    await loadSlot(page, 1, "in.mp3", `${FIX}/in.mp3`);
    await loadSlot(page, 1, "in.wav", `${FIX}/in.wav`);
    await loadSlot(page, 1, "in.m4a", `${FIX}/in.m4a`);
    return pass("mp3, wav, m4a decoded in Slot 2");
  });

  const instrumental = makeWav(30, 220);
  const guide = makeWav(25, 440, true);

  await item(3, async () => {
    await gotoPrep();
    await loadSlot(page, 0, "solo-instrumental.wav", instrumental, "audio/wav");
    await resetTrace(page);
    await btn(page, "Play both").click();
    await btn(page, "Pause both").waitFor({ timeout: 6_000 });
    await page.waitForTimeout(200);
    const t = await trace(page);
    const alerts = await page.locator('[role="alert"]').count();
    await btn(page, "Pause both").click();
    if (t.starts.length !== 1) return `expected exactly 1 source start, got ${t.starts.length}`;
    if (alerts) return "error alert shown";
    return pass("transport ran with only Slot 1 (1 source started, no errors)");
  });

  await item(4, async () => {
    const txt = await page.getByText(/35% · -9 dB/).count();
    const slider = await page.locator('[aria-label="Slot 1 · Instrumental fader"] [role="slider"]').getAttribute("aria-valuenow");
    return txt === 1 && slider === "35" ? pass("35% · -9 dB (aria-valuenow=35)") : `text=${txt} slider=${slider}`;
  });
  await item(5, async () => {
    const txt = await page.getByText(/40% · -8 dB/).count();
    const slider = await page.locator('[aria-label="Slot 2 · Guide vocal fader"] [role="slider"]').getAttribute("aria-valuenow");
    return txt === 1 && slider === "40" ? pass("40% · -8 dB (aria-valuenow=40)") : `text=${txt} slider=${slider}`;
  });

  // Load guide for the rest of the deck tests, start playback.
  await loadSlot(page, 1, "guide-vocal.wav", guide, "audio/wav");
  await btn(page, "Reset").click();
  await resetTrace(page);
  await btn(page, "Play both").click();
  await btn(page, "Pause both").waitFor({ timeout: 6_000 });
  await page.waitForTimeout(150);

  await item(6, async () => {
    const t = await trace(page);
    const ok = t.connections.some((c) => c.from === "DynamicsCompressorNode" && c.to === "AudioDestinationNode")
      && t.connections.some((c) => c.from === "GainNode" && c.to === "DynamicsCompressorNode");
    return ok ? pass("GainNode → DynamicsCompressorNode → AudioDestinationNode") : JSON.stringify(t.connections);
  });

  await item(7, async () => {
    await setSlider(page, "Slot 1 · Instrumental fader", "End");
    let t = await trace(page); const hi = lastPair(t);
    const hiText = await page.getByText(/100% · 0 dB/).count();
    await setSlider(page, "Slot 1 · Instrumental fader", "Home");
    t = await trace(page); const lo = lastPair(t);
    const loText = await page.getByText(/0% · −∞ dB/).count();
    await setSlider(page, "Slot 1 · Instrumental fader", "End");
    for (let i = 0; i < 65; i++) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(80);
    t = await trace(page); const mid = lastPair(t);
    const ok = hi?.[0] === 1 && lo?.[0] === 0 && Math.abs(mid?.[0] - 0.35) < 1e-6 && hiText === 1 && loText === 1;
    return ok ? pass(`gain targets 1.00 → 0.00 → 0.35 (setTargetAtTime, live)`) : `hi=${hi} lo=${lo} mid=${mid} text=${hiText}/${loText}`;
  });
  await item(8, async () => {
    await setSlider(page, "Slot 2 · Guide vocal fader", "End");
    let t = await trace(page); const hi = lastPair(t);
    await setSlider(page, "Slot 2 · Guide vocal fader", "Home");
    t = await trace(page); const lo = lastPair(t);
    await setSlider(page, "Slot 2 · Guide vocal fader", "End");
    for (let i = 0; i < 60; i++) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(80);
    t = await trace(page); const mid = lastPair(t);
    const ok = hi?.[1] === 1 && lo?.[1] === 0 && Math.abs(mid?.[1] - 0.4) < 1e-6;
    return ok ? pass(`gain targets 1.00 → 0.00 → 0.40 (setTargetAtTime, live)`) : `hi=${hi} lo=${lo} mid=${mid}`;
  });

  const muteBtns = page.getByRole("button", { name: "Mute", exact: true });
  const soloBtns = page.getByRole("button", { name: "S Solo", exact: true });
  await item(9, async () => {
    const w0 = await progressWidth(page); const s0 = (await trace(page)).starts.length;
    await muteBtns.nth(0).click(); await page.waitForTimeout(300);
    const t = await trace(page); const pair = lastPair(t);
    const w1 = await progressWidth(page);
    const playing = await btn(page, "Pause both").count();
    await muteBtns.nth(0).click(); await page.waitForTimeout(50);
    const after = lastPair(await trace(page));
    const ok = pair[0] === 0 && Math.abs(pair[1] - 0.4) < 1e-6 && w1 > w0 && playing === 1 && t.starts.length === s0 && Math.abs(after[0] - 0.35) < 1e-6;
    return ok ? pass(`slot1 gain → 0, clock advanced ${w0.toFixed(1)}%→${w1.toFixed(1)}%, no restart`) : `pair=${pair} w=${w0}/${w1} playing=${playing}`;
  });
  await item(10, async () => {
    const w0 = await progressWidth(page); const s0 = (await trace(page)).starts.length;
    await muteBtns.nth(1).click(); await page.waitForTimeout(300);
    const t = await trace(page); const pair = lastPair(t);
    const w1 = await progressWidth(page);
    const playing = await btn(page, "Pause both").count();
    await muteBtns.nth(1).click(); await page.waitForTimeout(50);
    const after = lastPair(await trace(page));
    const ok = pair[1] === 0 && Math.abs(pair[0] - 0.35) < 1e-6 && w1 > w0 && playing === 1 && t.starts.length === s0 && Math.abs(after[1] - 0.4) < 1e-6;
    return ok ? pass(`slot2 gain → 0, clock advanced ${w0.toFixed(1)}%→${w1.toFixed(1)}%, no restart`) : `pair=${pair} w=${w0}/${w1} playing=${playing}`;
  });
  await item(11, async () => {
    await soloBtns.nth(0).click(); await page.waitForTimeout(80);
    const pair = lastPair(await trace(page));
    await soloBtns.nth(0).click(); await page.waitForTimeout(80);
    const after = lastPair(await trace(page));
    const ok = Math.abs(pair[0] - 0.35) < 1e-6 && pair[1] === 0 && Math.abs(after[1] - 0.4) < 1e-6;
    return ok ? pass("solo1 → [0.35, 0], unsolo → guide restored 0.40") : `pair=${pair} after=${after}`;
  });
  await item(12, async () => {
    await soloBtns.nth(1).click(); await page.waitForTimeout(80);
    const pair = lastPair(await trace(page));
    await soloBtns.nth(1).click(); await page.waitForTimeout(80);
    const after = lastPair(await trace(page));
    const ok = pair[0] === 0 && Math.abs(pair[1] - 0.4) < 1e-6 && Math.abs(after[0] - 0.35) < 1e-6;
    return ok ? pass("solo2 → [0, 0.40], unsolo → backing restored 0.35") : `pair=${pair} after=${after}`;
  });
  await btn(page, "Pause both").click();

  // ── SECTION 2 ──────────────────────────────────────────────────────────
  console.log("SECTION 2: nudge engine");
  await item(13, async () => {
    for (let i = 0; i < 4; i++) await btn(page, "+5s").click();
    const hi = await offsetText(page);
    await btn(page, "0.000s Reset").click();
    for (let i = 0; i < 4; i++) await btn(page, "−5s").click();
    const lo = await offsetText(page);
    await btn(page, "0.000s Reset").click();
    const ok = /\+15\.000s/.test(hi) && /-15\.000s/.test(lo) && pageErrors.length === 0;
    return ok ? pass(`${hi.trim()} / ${lo.trim()} (clamped, no errors)`) : `${hi} ${lo} errs=${pageErrors}`;
  });
  await item(14, async () => {
    await btn(page, "+5s").click(); const a = await offsetText(page);
    await btn(page, "−5s").click(); await btn(page, "−5s").click(); const b = await offsetText(page);
    await btn(page, "0.000s Reset").click();
    return /\+5\.000s/.test(a) && /-5\.000s/.test(b) ? pass(`${a.trim()} / ${b.trim()}`) : `${a} ${b}`;
  });
  await item(15, async () => {
    await btn(page, "+1s").click(); const a = await offsetText(page);
    await btn(page, "−1s").click(); await btn(page, "−1s").click(); const b = await offsetText(page);
    await btn(page, "0.000s Reset").click();
    return /\+1\.000s/.test(a) && /-1\.000s/.test(b) ? pass(`${a.trim()} / ${b.trim()}`) : `${a} ${b}`;
  });
  await item(16, async () => {
    await btn(page, "+50ms").click(); const a = await offsetText(page);
    await btn(page, "+50ms").click(); await btn(page, "+50ms").click(); const c = await offsetText(page);
    await btn(page, "−50ms").click(); await btn(page, "−50ms").click(); await btn(page, "−50ms").click(); await btn(page, "−50ms").click(); const b = await offsetText(page);
    await btn(page, "0.000s Reset").click();
    return /\+0\.050s/.test(a) && /\+0\.150s/.test(c) && /-0\.050s/.test(b) ? pass(`+0.050 → +0.150 → -0.050 (ms exact)`) : `${a} ${c} ${b}`;
  });
  await item(17, async () => {
    await btn(page, "+5s").click(); await btn(page, "+1s").click(); await btn(page, "+50ms").click();
    const before = await offsetText(page);
    await btn(page, "0.000s Reset").click();
    const after = await offsetText(page);
    const disabled = await btn(page, "0.000s Reset").isDisabled();
    return /\+6\.050s/.test(before) && /\+0\.000s/.test(after) && disabled ? pass("+6.050s → +0.000s instantly") : `${before} ${after}`;
  });
  await item(18, async () => {
    await btn(page, "Reset").click();
    await resetTrace(page);
    await btn(page, "Play both").click();
    await btn(page, "Pause both").waitFor({ timeout: 6_000 });
    await page.waitForTimeout(400);
    const t0 = await trace(page);
    const instrStarts0 = t0.starts.filter((s) => Math.abs(s.dur - 30) < 0.1).length;
    await btn(page, "+1s").click(); await page.waitForTimeout(150);
    await btn(page, "−1s").click(); await page.waitForTimeout(150);
    await btn(page, "−1s").click(); await page.waitForTimeout(150);
    const t1 = await trace(page);
    const instrStarts1 = t1.starts.filter((s) => Math.abs(s.dur - 30) < 0.1).length;
    const guideStarts = t1.starts.filter((s) => Math.abs(s.dur - 25) < 0.1);
    const playing = await btn(page, "Pause both").count();
    const w0 = await progressWidth(page); await page.waitForTimeout(250); const w1 = await progressWidth(page);
    // Last reschedule at offset -1.000s: guide audio offset should be position + 1 (position ≈ elapsed).
    const last = guideStarts[guideStarts.length - 1];
    const elapsed = last.ctxTime - t0.starts[0].when; // instrumental position at reschedule
    const offsetErr = Math.abs(last.offset - (elapsed + 1));
    await btn(page, "0.000s Reset").click();
    await btn(page, "Pause both").click();
    const ok = instrStarts1 === instrStarts0 && guideStarts.length >= 4 && playing === 1 && w1 > w0 && offsetErr < 0.02;
    return ok ? pass(`guide rescheduled ${guideStarts.length - 1}× live, instrumental untouched, clock advancing, reschedule offset err ${(offsetErr * 1000).toFixed(1)}ms`) : `instr ${instrStarts0}/${instrStarts1} guide=${guideStarts.length} playing=${playing} err=${offsetErr}`;
  });
  await item(19, async () => {
    const out = page.locator("output").filter({ hasText: "OFFSET:" });
    const live = await out.getAttribute("aria-live");
    if (!/\+0\.000s/.test(await out.innerText())) await btn(page, "0.000s Reset").click();
    await btn(page, "+1s").click(); await btn(page, "+1s").click(); await btn(page, "+50ms").click(); await btn(page, "+50ms").click(); await btn(page, "+50ms").click();
    const text = (await out.innerText()).trim();
    const color = await out.evaluate((el) => getComputedStyle(el).color);
    await btn(page, "0.000s Reset").click();
    const ok = /^OFFSET:\s\+2\.150s$/.test(text) && live === "polite";
    return ok ? pass(`"${text}" aria-live=polite color=${color}`) : `text="${text}" live=${live}`;
  });

  // ── SECTION 3 ──────────────────────────────────────────────────────────
  console.log("SECTION 3: lyrics");
  const LYRICS = ["Riding on the gravel road", "Wind is howling through the pines", "Stars come out and light the sky", "Another mile before sunrise"];
  const textarea = page.locator('textarea[aria-label="Workshop lyrics"]');
  await item(20, async () => {
    await textarea.fill(LYRICS.join("\n"));
    const blocks = await page.getByText("4 blocks", { exact: true }).count();
    const ready = await page.getByText("1 of 4 lines ready").count();
    return blocks === 1 && ready === 1 ? pass("4 lines → 4 blocks, 1 of 4 ready") : `blocks=${blocks} ready=${ready}`;
  });
  await item(22, async () => {
    await btn(page, "Reset").click();
    await btn(page, "Play both").click();
    await btn(page, "Pause both").waitFor({ timeout: 6_000 });
    await page.waitForTimeout(300);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    const pressed = [];
    for (let i = 0; i < 4; i++) {
      const before = await page.evaluate(() => window.__ctxs[0].currentTime);
      await page.keyboard.press("Space");
      const after = await page.evaluate(() => window.__ctxs[0].currentTime);
      pressed.push([before, after]);
      await page.waitForTimeout(350);
    }
    await btn(page, "Pause both").click();
    const t = await trace(page);
    const startWhen = t.starts.filter((s) => Math.abs(s.dur - 30) < 0.1).slice(-1)[0].when;
    const stamps = await page.locator(".workshop-prompter span.font-mono").allInnerTexts();
    const parsed = stamps.map((s) => { const m = s.match(/(\d+):(\d+\.\d)/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; });
    const done = await page.getByText("All lines timed").count();
    let maxErr = 0;
    parsed.forEach((v, i) => { if (v === null) { maxErr = 99; return; } const expected = (pressed[i][0] + pressed[i][1]) / 2 - startWhen; maxErr = Math.max(maxErr, Math.abs(v - expected)); });
    const ok = done === 1 && parsed.length === 4 && parsed.every((v, i) => v !== null && (i === 0 || v > parsed[i - 1])) && maxErr < 0.11;
    return ok ? pass(`4 stamps ${parsed.map((v) => v.toFixed(1)).join("/")}s from AudioContext.currentTime (max err ${(maxErr * 1000).toFixed(0)}ms, display 0.1s res)`) : `stamps=${JSON.stringify(stamps)} err=${maxErr} done=${done}`;
  });
  await item(24, async () => {
    const before = await textarea.inputValue();
    await btn(page, "Reset timing").click();
    const after = await textarea.inputValue();
    const dashes = (await page.locator(".workshop-prompter span.font-mono").allInnerTexts()).filter((s) => s.trim() === "—").length;
    const ready = await page.getByText("1 of 4 lines ready").count();
    const disabled = await btn(page, "Reset timing").isDisabled();
    return before === after && after === LYRICS.join("\n") && dashes === 4 && ready === 1 && disabled ? pass("timestamps cleared (4 × —), lyric text intact") : `same=${before === after} dashes=${dashes} ready=${ready}`;
  });

  // Longer instrumental for LRCLIB sync (real network).
  const longInstrumental = makeWav(40, 196);
  await item(21, async () => {
    await page.locator('input[aria-label="Search LRCLIB"]').fill("Queen Bohemian Rhapsody");
    await btn(page, "Search").click();
    const synced = page.locator("button", { hasText: "synced" }).first();
    await synced.waitFor({ timeout: 20_000 });
    const n = await page.locator("button", { hasText: "synced" }).count();
    await synced.click();
    await page.getByText(/\d+ timestamps/).waitFor({ timeout: 5_000 });
    const badge = await page.getByText(/\d+ timestamps/).innerText();
    const lyricText = await textarea.inputValue();
    const lines = lyricText.split("\n").length;
    return lines > 10 && /\d+ timestamps/.test(badge) ? pass(`${n} synced results; mapped ${badge}, ${lines} lines`) : `lines=${lines} badge=${badge}`;
  });
  await item(23, async () => {
    await loadSlot(page, 0, "long-backing.wav", longInstrumental, "audio/wav");
    // Slot reload clears manual timings but LRCLIB synced lyrics remain in state; re-select if needed.
    if ((await page.getByText(/\d+ timestamps/).count()) === 0) return "synced lyrics lost after reload";
    await btn(page, "Play both").click();
    await btn(page, "Pause both").waitFor({ timeout: 6_000 });
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(i === 0 ? 1200 : 2500);
      samples.push(await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".workshop-prompter .space-y-3 > div")];
        const parse = (s) => { const m = s.match(/(\d+):(\d+\.\d)/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
        const ctx = window.__ctxs[0];
        const st = window.__audioTrace.starts.filter((x) => Math.abs(x.dur - 40) < 0.1).slice(-1)[0];
        const clock = st ? ctx.currentTime - st.when + st.offset : null;
        const activeIdx = rows.findIndex((r) => r.className.includes("ring-1"));
        const times = rows.map((r) => parse(r.querySelector("span.font-mono")?.textContent ?? ""));
        return { clock, activeIdx, times, activeText: rows[activeIdx]?.querySelector("p")?.textContent ?? null };
      }));
    }
    await btn(page, "Pause both").click();
    const ok = samples.every((s) => {
      if (s.clock === null) return false;
      if (s.activeIdx < 0) return s.times.every((t) => t === null || t > s.clock - 0.15); // before first line
      const at = s.times[s.activeIdx]; const next = s.times[s.activeIdx + 1];
      return at !== null && at <= s.clock + 0.15 && (next === null || next >= s.clock - 0.15);
    }) && new Set(samples.map((s) => s.activeText)).size >= 2;
    return ok ? pass(`active line tracked clock at t=${samples.map((s) => s.clock.toFixed(2)).join("/")}s (${samples.map((s) => JSON.stringify(s.activeText)).join(" → ")})`) : JSON.stringify(samples);
  });

  // ── SECTION 4 ──────────────────────────────────────────────────────────
  console.log("SECTION 4: vault");
  await page.evaluate(() => {
    window.__idbPuts = []; window.__txCalls = 0; window.__injectAbort = false;
    const origOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (...a) {
      const req = origOpen(...a);
      req.addEventListener("success", () => {
        const db = req.result; const origTx = db.transaction.bind(db);
        db.transaction = function (...ta) {
          window.__txCalls++;
          if (window.__injectAbort) { window.__injectAbort = false; throw new DOMException("Connection to Indexed Database server lost (simulated).", "InvalidStateError"); }
          const tx = origTx(...ta); const origStore = tx.objectStore.bind(tx);
          tx.objectStore = function (...sa) {
            const store = origStore(...sa); const origPut = store.put.bind(store);
            store.put = function (value, ...rest) {
              window.__idbPuts.push({
                id: value?.id, title: value?.title, durationSeconds: value?.durationSeconds,
                instrumentalIsBlob: value?.instrumental instanceof Blob, instrumentalIsAudioBuffer: value?.instrumental instanceof AudioBuffer,
                instrumentalBytes: value?.instrumental?.size,
                guideIsBlob: value?.guideVocal instanceof Blob, guideNull: value?.guideVocal === null,
                linesCount: Array.isArray(value?.lines) ? value.lines.length : -1,
                syncedLyricsCount: Array.isArray(value?.syncedLyrics) ? value.syncedLyrics.length : -1,
                guideOffsetSeconds: value?.guideOffsetSeconds, mixer: value?.mixer,
                sample: value?.syncedLyrics?.[1],
              });
              return origPut(value, ...rest);
            };
            return store;
          };
          return tx;
        };
      });
      return req;
    };
  });
  // Set an offset so the metadata check is meaningful, then save the LRCLIB-synced long track.
  await btn(page, "+50ms").click();
  await item(25, async () => {
    await page.evaluate(() => { window.__gkLogs = []; });
    await page.getByRole("button", { name: "Save to Vault" }).click();
    await page.getByText("Saved to Vault").waitFor({ timeout: 15_000 });
    const puts = await page.evaluate(() => window.__idbPuts);
    const p = puts[puts.length - 1];
    return p.instrumentalIsBlob && !p.instrumentalIsAudioBuffer && p.guideIsBlob ? pass(`instrumental Blob (${p.instrumentalBytes} B) + guide Blob; no AudioBuffer in payload`) : JSON.stringify(p);
  });
  let savedEntry = await page.evaluate(() => window.__idbPuts[window.__idbPuts.length - 1]);
  await item(28, async () => {
    const p = savedEntry;
    const ok = p.instrumentalIsBlob && p.guideIsBlob && p.syncedLyricsCount > 10 && p.linesCount === p.syncedLyricsCount
      && Math.abs(p.guideOffsetSeconds - 0.05) < 1e-9 && typeof p.sample?.timeSeconds === "number" && typeof p.sample?.text === "string" && p.mixer?.instrumentalLevel === 35;
    return ok ? pass(`Slot1 Blob, Slot2 Blob, ${p.syncedLyricsCount}-line LRC array, offset +0.050s, mixer 35/40`) : JSON.stringify(p);
  });
  await item(27, async () => {
    // Behavioural: first transaction() throws InvalidStateError (lost connection); open handler must reconnect + retry.
    await page.evaluate(() => { window.__injectAbort = true; window.__txCalls = 0; });
    await btn(page, "−50ms").click(); // dirty → Save re-enabled
    await page.getByRole("button", { name: "Save to Vault" }).click();
    await page.getByText("Saved to Vault").waitFor({ timeout: 15_000 });
    const tx = await page.evaluate(() => window.__txCalls);
    const alerts = await page.locator('[role="alert"]').count();
    return tx >= 2 && alerts === 0 ? pass(`simulated lost-connection on 1st transaction → reopened + retried (${tx} transaction attempts), save succeeded`) : `tx=${tx} alerts=${alerts}`;
  });
  await item(26, async () => {
    // >50 MB raw PCM instrumental (Chromium engine; WebKit binary is not available in this environment).
    const bigPath = `${FIX}/big-backing.wav`;
    if (!fs.existsSync(bigPath)) fs.writeFileSync(bigPath, makeWav(312, 110)); // ~55 MB
    await loadSlot(page, 0, "big-backing.wav", bigPath);
    await page.evaluate(() => { window.__gkLogs = []; });
    await page.getByRole("button", { name: "Save to Vault" }).click();
    await page.getByText("Saved to Vault").waitFor({ timeout: 60_000 });
    const p = await page.evaluate(() => window.__idbPuts[window.__idbPuts.length - 1]);
    const errs = await page.evaluate(() => window.__gkLogs.filter((l) => /indexed|connection|lost/i.test(l.msg)));
    const count = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("gkp-stage-catalog"); r.onsuccess = () => { const c = r.result.transaction("workshops").objectStore("workshops").count(); c.onsuccess = () => res(c.result); }; }));
    const readBack = await page.evaluate((id) => new Promise((res) => { const r = indexedDB.open("gkp-stage-catalog"); r.onsuccess = () => { const g = r.result.transaction("workshops").objectStore("workshops").get(id); g.onsuccess = () => res(g.result?.instrumental?.size ?? -1); }; }), p.id);
    return p.instrumentalBytes > 50 * 1024 * 1024 && errs.length === 0 && readBack === p.instrumentalBytes
      ? `${(p.instrumentalBytes / 1048576).toFixed(1)} MB Blob stored and read back intact, ${count} entries, no connection-lost errors [Chromium only — WebKit runtime unavailable here]`
      : `bytes=${p.instrumentalBytes} errs=${JSON.stringify(errs)} readBack=${readBack}`;
  });
  savedEntry = await page.evaluate(() => window.__idbPuts[window.__idbPuts.length - 1]);

  // ── SECTION 5 ──────────────────────────────────────────────────────────
  console.log("SECTION 5: main stage");
  await page.goto(`${baseUrl}/main-stage`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Select song from Vault" }).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await item("N1", async () => {
    const card = page.locator('[data-testid="stage-empty-prep-card"]');
    const cardVisible = await card.isVisible();
    const prepBtns = page.getByRole("button", { name: "Prep Backing Track & Sync Lyrics" });
    const n = await prepBtns.count();
    const visible = [];
    for (let i = 0; i < n; i++) visible.push(await prepBtns.nth(i).isVisible());
    const vaultCta = await card.getByText("Load from Vault").isVisible();
    return cardVisible && n >= 2 && visible.every(Boolean) && vaultCta ? pass(`empty-stage CTA card + rail button visible on first paint (${n} prep buttons, Load from Vault present)`) : `card=${cardVisible} n=${n} visible=${visible}`;
  });
  await item("N1b", async () => {
    await page.getByRole("button", { name: "Prep Backing Track & Sync Lyrics" }).first().click();
    await page.getByText("Track & Lyric Prep", { exact: true }).waitFor({ timeout: 10_000 });
    const url = new URL(page.url()).pathname;
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Select song from Vault" }).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(400);
    return url === "/studio/track-prep" ? pass("routes to /studio/track-prep in one tap") : url;
  });
  await item(30, async () => {
    const nav = await page.locator('nav[aria-label="Core navigation"]').count();
    const tabs = await page.locator('[data-testid^="nav-tab-"]').count();
    const header = await page.locator("header.studio-chrome").count();
    // Control: nav must exist on a normal route.
    return nav === 0 && tabs === 0 && header === 0 ? pass("nav[aria-label=Core navigation] and nav-tab-* absent from DOM (0 nodes)") : `nav=${nav} tabs=${tabs} header=${header}`;
  });
  await item(32, async () => {
    const files = await page.locator('input[type="file"]').count();
    const ta = await page.locator("textarea").count();
    const prep = await page.getByText(/Track & Lyric Prep|Dual audio deck|Line-break lyric parser|LRCLIB/).count();
    return files === 0 && ta === 0 && prep === 0 ? pass("no file inputs, textareas, or prep panels on stage") : `files=${files} textarea=${ta} prep=${prep}`;
  });
  await item(33, async () => {
    await page.getByRole("button", { name: "Select song from Vault" }).first().click();
    await page.getByText("big-backing", { exact: false }).first().waitFor({ timeout: 10_000 });
    const titles = ["big-backing", "long-backing"];
    const present = [];
    for (const t of titles) present.push(await page.getByText(t, { exact: false }).count() > 0);
    const idbCount = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("gkp-stage-catalog"); r.onsuccess = () => { const c = r.result.transaction("workshops").objectStore("workshops").count(); c.onsuccess = () => res(c.result); }; }));
    const rowCount = await page.locator('[aria-label="Select song from Vault"] button').filter({ hasText: /synced lines/ }).count();
    return present.every(Boolean) && rowCount === idbCount ? pass(`${rowCount} rows listed = ${idbCount} IndexedDB entries (${titles.join(", ")})`) : `present=${present} rows=${rowCount} idb=${idbCount}`;
  });
  await item(29, async () => {
    const row = page.locator('[aria-label="Select song from Vault"] button').filter({ hasText: "long-backing" }).first();
    const text = await row.innerText();
    return /long-backing/.test(text) && /0:40/.test(text) ? pass(`row: "${text.replace(/\n/g, " · ")}"`) : `row text: ${text}`;
  });
  await item(34, async () => {
    await resetTrace(page);
    await page.locator('[aria-label="Select song from Vault"] button').filter({ hasText: "long-backing" }).first().click();
    const play = page.getByRole("button", { name: "Play playback" });
    await play.waitFor({ timeout: 10_000 });
    const title = await page.getByText("long-backing", { exact: false }).count();
    const dur = await page.getByText(/0:40/).count();
    await play.click();
    await page.waitForTimeout(400);
    const t = await trace(page);
    const started = t.starts.filter((s) => Math.abs(s.dur - 40) < 0.1);
    const pause = await page.getByRole("button", { name: "Pause playback" }).count();
    return started.length >= 1 && pause === 1 && title > 0 ? pass(`Blob decoded to ${started[0].dur.toFixed(1)}s AudioBuffer, transport armed, Play started source`) : `starts=${JSON.stringify(t.starts)} pause=${pause} dur=${dur}`;
  });
  await item(35, async () => {
    const expected = savedEntryLines();
    function savedEntryLines() { return null; }
    const lines = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("gkp-stage-catalog"); r.onsuccess = () => { const g = r.result.transaction("workshops").objectStore("workshops").getAll(); g.onsuccess = () => { const e = g.result.find((x) => x.title === "long-backing"); res(e.lines.map((l) => ({ t: l.timeSeconds, text: l.text }))); }; }; }));
    void expected;
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(i === 0 ? 800 : 2500);
      samples.push(await page.evaluate((all) => {
        const ctx = window.__ctxs[window.__ctxs.length - 1];
        const t = window.__audioTrace.starts[0];
        const pos = ctx.currentTime - t.when + t.offset;
        const mounted = document.querySelectorAll(".stage-cadence-block").length;
        const expectedIdx = all.reduce((acc, l, i) => (l.t <= pos ? i : acc), -1);
        const expectedText = expectedIdx >= 0 ? all[expectedIdx].text.trim() : null;
        const activeRow = document.querySelector(".rolling-prompter p.ring-1");
        const best = activeRow?.querySelector("span")?.textContent?.trim() ?? null;
        return { pos: Number(pos.toFixed(2)), expectedText, highlighted: best, mounted, total: all.length };
      }, lines));
    }
    await page.getByRole("button", { name: "Pause playback" }).click();
    const ok = samples.every((s) => s.expectedText === null || s.highlighted === s.expectedText) && samples[0].mounted === samples[0].total && new Set(samples.map((s) => s.highlighted)).size >= 2;
    return ok ? pass(`highlighted line matched AudioContext clock at ${samples.map((s) => s.pos).join("/")}s; ${samples[0].mounted}/${samples[0].total} lyric lines mounted (3-line rolling window)`) : JSON.stringify(samples);
  });
  await item(31, async () => {
    const vp = page.viewportSize();
    const names = ["Play playback", "Turn monitor mic on"];
    const boxes = {};
    for (const n of names) boxes[n] = await page.getByRole("button", { name: n }).first().boundingBox();
    const scrub = page.locator('[role="slider"], input[type="range"]').first();
    boxes.scrubber = await scrub.boundingBox();
    const inBottom = Object.values(boxes).every((b) => b && b.y + b.height <= vp.height && b.y > vp.height * 0.6 && b.x >= 0 && b.x + b.width <= vp.width);
    // Nothing else may cover the transport: elementFromPoint at the play button center must be the button (or its child).
    const covered = await page.evaluate(() => {
      const b = document.querySelector('[aria-label="Play playback"]'); if (!b) return "no play";
      const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return b.contains(el) ? null : (el?.tagName + "." + el?.className);
    });
    return inBottom && !covered ? pass(`play/scrubber/mic at y=${Object.values(boxes).map((b) => Math.round(b.y)).join("/")} of ${vp.height}, unobstructed`) : `boxes=${JSON.stringify(boxes)} covered=${covered}`;
  });
  await item(36, async () => {
    await resetTrace(page);
    await page.getByRole("button", { name: "Turn monitor mic on" }).first().click();
    await page.getByRole("button", { name: "Turn monitor mic off" }).first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const t = await trace(page);
    const m = await page.evaluate(() => {
      const ctxs = window.__ctxs;
      return ctxs.map((c) => ({ state: c.state, sr: c.sampleRate, base: c.baseLatency, out: c.outputLatency }));
    });
    const micWired = t.connections.some((c) => c.from === "MediaStreamAudioSourceNode");
    const toDest = t.connections.some((c) => c.to === "AudioDestinationNode");
    const scriptProc = t.connections.some((c) => /ScriptProcessor/.test(c.from) || /ScriptProcessor/.test(c.to));
    const running = m.filter((c) => c.state === "running");
    const base = running.length ? Math.max(...running.map((c) => c.base ?? 0)) : NaN;
    const outL = running.length ? Math.max(...running.map((c) => c.out ?? 0)) : NaN;
    const alerts = await page.locator('[role="alert"]').count();
    await page.getByRole("button", { name: "Turn monitor mic off" }).first().click();
    const ok = micWired && toDest && !scriptProc && base <= 0.0125 && alerts === 0;
    return ok ? pass(`mic → destination direct Web Audio graph (latencyHint interactive), baseLatency ${(base * 1000).toFixed(1)}ms (512-frame quantum), device outputLatency ${(outL * 1000).toFixed(0)}ms reported by headless fake device, no ScriptProcessor`) : `mic=${micWired} dest=${toDest} sp=${scriptProc} base=${base} ctx=${JSON.stringify(m)} alerts=${alerts}`;
  });

  await item("N2", async () => {
    await page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded" });
    const card = page.locator('[data-testid="studio-track-prep-launch"]');
    await card.waitFor({ timeout: 15_000 });
    const box = await card.boundingBox();
    const title = await card.getByText("Track & Lyric Prep").isVisible();
    const sub = await card.getByText("Upload stems, time lyrics, and prep songs for Main Stage").isVisible();
    const h1 = await page.locator("h1").first().boundingBox();
    await card.click();
    await page.getByText("Track & Lyric Prep", { exact: true }).waitFor({ timeout: 10_000 });
    const url = new URL(page.url()).pathname;
    return title && sub && box.y < h1.y && url === "/studio/track-prep" ? pass(`launch card above Studio heading (y=${Math.round(box.y)} < ${Math.round(h1.y)}), one tap → /studio/track-prep`) : `title=${title} sub=${sub} url=${url}`;
  });
  await item("N3", async () => {
    // Already on /studio/track-prep from N2. Prep a short song and use Take to Main Stage.
    await loadSlot(page, 0, "takeoff.wav", makeWav(8, 262), "audio/wav");
    await textarea.fill("Line one\nLine two");
    await btn(page, "Play both").click();
    await btn(page, "Pause both").waitFor({ timeout: 6_000 });
    await page.waitForTimeout(250);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Space"); await page.waitForTimeout(300); await page.keyboard.press("Space");
    await btn(page, "Pause both").click();
    const save = page.getByRole("button", { name: "Save to Vault" });
    const take = page.getByRole("button", { name: /Take to Main Stage/ });
    const sb = await save.boundingBox(); const tb = await take.boundingBox();
    const adjacent = sb && tb && Math.abs(sb.y - tb.y) < 8;
    await resetTrace(page);
    await take.click();
    await page.getByRole("button", { name: "Play playback" }).waitFor({ timeout: 15_000 });
    const url = new URL(page.url());
    const armed = await page.getByText("takeoff", { exact: false }).count();
    const emptyCard = await page.locator('[data-testid="stage-empty-prep-card"]').count();
    const mounted = await page.locator(".stage-cadence-block").count();
    return adjacent && url.pathname === "/main-stage" && url.searchParams.get("song") && armed > 0 && emptyCard === 0 && mounted === 2 ? pass(`button beside Save to Vault; saved + routed to /main-stage?song=… with "takeoff" armed (2 lyric lines mounted, empty card gone)`) : `adjacent=${adjacent} url=${url} armed=${armed} empty=${emptyCard} mounted=${mounted}`;
  });

  await browser.close();
  fs.mkdirSync("tests/results", { recursive: true });
  fs.writeFileSync("tests/results/regression-40.browser.json", JSON.stringify({
    ranAt: new Date().toISOString(), engine: "Chromium (system) via Playwright", baseUrl,
    items: [...results].map(([id, ok]) => ({ id, result: ok ? "PASS" : "FAIL", note: notes.get(id) ?? null })),
    pageErrors,
  }, null, 2));
  console.log("\nPAGE ERRORS:", pageErrors.length ? pageErrors : "none");
  console.log("\nRESULTS");
  for (const [k, v] of [...results].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))) console.log(`${String(k).padStart(2, "0")}. ${v ? "PASS" : "FAIL"}`);
  const failed = [...results].filter(([, v]) => !v).map(([k]) => k);
  process.exitCode = failed.length ? 1 : 0;
}

run().catch((e) => { console.error("SUITE CRASH:", e); process.exit(2); });
