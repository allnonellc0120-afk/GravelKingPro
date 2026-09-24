#!/usr/bin/env node
/**
 * Records the REAL GravelKing Pro duet stage for the promo.
 *
 * Two headless Chromium instances join the same duet room on the running
 * dev web app. Each has a fake microphone fed from a WAV file (Chromium's
 * --use-file-for-fake-audio-capture) so the host + partner risers respond
 * to actual audio through the real WebRTC / analyser path. The host arms a
 * track (with real synced lyrics) from the Stage Vault via ?song=<id>,
 * turns the monitor on, and presses Play. A 100 ms white flash is injected
 * at the exact moment Play is clicked so the post step can align the
 * recorded video to the song audio precisely.
 *
 * Usage:
 *   node scripts/capture-stage.mjs \
 *     --base http://localhost:19390 --out /tmp/promo/stage \
 *     --audio /tmp/promo/stage_window.wav --lines /tmp/promo/stage_lines.json \
 *     --micHost /tmp/promo/mic_host.wav --micPartner /tmp/promo/mic_partner.wav \
 *     --seconds 66 --width 1920 --height 1080
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = args.base ?? 'http://localhost:19390';
const OUT = args.out ?? '/tmp/promo/stage';
const AUDIO = args.audio;
const LINES = args.lines;
const MIC_HOST = args.micHost;
const MIC_PARTNER = args.micPartner;
const SECONDS = Number(args.seconds ?? 66);
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const TITLE = args.title ?? 'Take My Heart';
const ROOM = args.room ?? `GK-PROMO${Date.now().toString(36).toUpperCase().slice(-5)}`;
for (const [k, v] of Object.entries({ AUDIO, LINES, MIC_HOST, MIC_PARTNER })) {
  if (!v || !fs.existsSync(v)) throw new Error(`Missing ${k}: ${v}`);
}
fs.mkdirSync(OUT, { recursive: true });

const CANDIDATE_CHROMIUMS = [
  '/nix/store/hvv3n9pvjfq0x8wjw8f3igsyvlaz1ngr-playwright-browsers-chromium/chromium-1091/chrome-linux/chrome',
  '/nix/store/gn1jv0wpg8zq97a48bqd5k5ck8hf0n2y-playwright-browsers-chromium/chromium-1048/chrome-linux/chrome',
  '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
];
function findChromium() {
  try {
    const p = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
    if (p) return p;
  } catch {}
  return CANDIDATE_CHROMIUMS.find((p) => fs.existsSync(p));
}
function ensurePlaywrightFfmpeg() {
  const systemFfmpeg = execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim();
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0'
    ? process.env.PLAYWRIGHT_BROWSERS_PATH
    : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ms-playwright');
  const bundled = path.join(cache, 'ffmpeg-1011', 'ffmpeg-linux');
  if (fs.existsSync(bundled) && fs.lstatSync(bundled).isDirectory()) fs.rmSync(bundled, { recursive: true, force: true });
  if (!fs.existsSync(bundled)) {
    fs.mkdirSync(path.dirname(bundled), { recursive: true });
    fs.symlinkSync(systemFfmpeg, bundled);
  }
}

const log = (...m) => console.log(new Date().toISOString().slice(11, 23), ...m);

async function launch(micFile, record) {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${micFile}`,
      '--hide-scrollbars',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    permissions: ['microphone'],
    ...(record ? { recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } } } : {}),
  });
  await ctx.grantPermissions(['microphone'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') log('[console]', m.text().slice(0, 200)); });
  return { browser, ctx, page };
}

/** Write a Stage Vault entry directly into the app's IndexedDB (same schema the Track Prep page saves). */
async function seedVault(page, id) {
  const audioB64 = fs.readFileSync(AUDIO).toString('base64');
  const lines = JSON.parse(fs.readFileSync(LINES, 'utf8'));
  await page.goto(`${BASE}/main-stage`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ id, title, audioB64, lines }) => {
    const bytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('gkp-stage-catalog', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('workshops')) req.result.createObjectStore('workshops', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('workshops', 'readwrite');
      tx.objectStore('workshops').put({
        id, createdAt: new Date().toISOString(), title,
        instrumental: blob, guideVocal: null, lines, syncedLyrics: lines,
        guideOffsetSeconds: 0, durationSeconds: 80,
      });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { id, title: TITLE, audioB64, lines });
}

async function main() {
  ensurePlaywrightFfmpeg();
  const songId = `promo-${Date.now()}`;
  const host = await launch(MIC_HOST, true);
  const partner = await launch(MIC_PARTNER, false);
  try {
    log('seeding vault entry', songId);
    await seedVault(host.page, songId);

    log('host joining room', ROOM);
    await host.page.goto(`${BASE}/stage/duet/${ROOM}?song=${songId}`, { waitUntil: 'domcontentloaded' });
    await host.page.locator('[data-testid="stage-performer-host"]').waitFor({ timeout: 20000 });
    // Track armed?
    await host.page.locator('[aria-label="Play playback"]').waitFor({ timeout: 20000 });
    log('host armed track');

    log('partner joining room');
    await partner.page.goto(`${BASE}/stage/duet/${ROOM}`, { waitUntil: 'domcontentloaded' });
    await partner.page.locator('[data-testid="stage-performer-host"]').waitFor({ timeout: 20000 });

    // Both mics on (real getUserMedia → fake device fed by the WAV files)
    for (const [name, p] of [['host', host.page], ['partner', partner.page]]) {
      const btn = p.getByRole('button', { name: /Monitor mic/i }).first();
      await btn.waitFor({ timeout: 15000 });
      await btn.click();
      log(name, 'monitor on');
      // Monitor-on pops the FX rack; close it so the stage floor stays clear.
      const closeFx = p.getByRole('button', { name: /Close FX rack/i }).first();
      if (await closeFx.isVisible({ timeout: 3000 }).catch(() => false)) await closeFx.click();
    }

    log('waiting for peer connection (duet mode)');
    await host.page.locator('.live-performance-stage[data-stage-mode="duet"]').waitFor({ timeout: 45000 });
    await host.page.locator('[data-testid="stage-performer-partner"]').waitFor({ timeout: 10000 });
    log('DUET CONNECTED — both risers on stage');
    await host.page.waitForTimeout(1500);

    // Flash marker + play in the same tick
    const playedAt = await host.page.evaluate(() => {
      const el = document.createElement('div');
      el.id = '__promo_flash';
      Object.assign(el.style, { position: 'fixed', inset: '0', background: '#fff', zIndex: '99999', pointerEvents: 'none' });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 120);
      const btn = document.querySelector('[aria-label="Play playback"]');
      btn?.click();
      return performance.now();
    });
    log('play clicked at', playedAt.toFixed(0));
    await host.page.locator('[aria-label="Pause playback"]').waitFor({ timeout: 5000 });

    // Sample levels while recording so we can prove the risers actually moved
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < SECONDS * 1000) {
      await host.page.waitForTimeout(2000);
      const s = await host.page.evaluate(() => {
        const q = (id) => document.querySelector(`[data-testid="stage-performer-${id}"]`);
        const lvl = (el) => el ? getComputedStyle(el).getPropertyValue('--mic-level') || el.getAttribute('data-mic-live') : null;
        const active = document.querySelector('.stage-lyric-line[data-active="true"], .stage-lyric-line.is-active, [data-lyric-active="true"]');
        return { host: lvl(q('host')), partner: lvl(q('partner')), mode: document.querySelector('.live-performance-stage')?.getAttribute('data-stage-mode'), lyric: active?.textContent?.slice(0, 40) ?? null };
      });
      samples.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
    }
    fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(samples, null, 1));
    log('samples', JSON.stringify(samples.slice(0, 6)));

    const video = host.page.video();
    await host.ctx.close();
    const vpath = await video.path();
    const final = path.join(OUT, 'stage_raw.webm');
    fs.renameSync(vpath, final);
    log('recorded', final);
  } finally {
    await host.browser.close().catch(() => {});
    await partner.browser.close().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
