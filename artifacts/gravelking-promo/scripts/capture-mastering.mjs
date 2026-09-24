#!/usr/bin/env node
/**
 * Records the REAL GravelKing Pro Mastering Tool running a master on the
 * promo track: upload → "Master with …" → real MLK V4 processing spinner →
 * result card → open the Fine-tune EQ rack → play the mastered A/B.
 *
 * Usage:
 *   node scripts/capture-mastering.mjs --base http://localhost:19390 \
 *     --out /tmp/promo/mastering --audio /tmp/promo/src_130.wav \
 *     --cookies /tmp/promo/cj.txt --width 1920 --height 1080
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = args.base ?? 'http://localhost:19390';
const OUT = args.out ?? '/tmp/promo/mastering';
const AUDIO = args.audio;
const COOKIES = args.cookies;
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
if (!AUDIO || !fs.existsSync(AUDIO)) throw new Error(`Missing audio ${AUDIO}`);
fs.mkdirSync(OUT, { recursive: true });
const log = (...m) => console.log(new Date().toISOString().slice(11, 23), ...m);

function findChromium() {
  try { const p = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(); if (p) return p; } catch {}
  return undefined;
}
/** Netscape cookie jar → Playwright cookies (keeps the same session that mastered via curl). */
function readJar(file) {
  if (!file || !fs.existsSync(file)) return [];
  const host = new URL(BASE).hostname;
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/^#HttpOnly_/, '')).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t')).filter((c) => c.length >= 7)
    .map((c) => ({ name: c[5], value: c[6], domain: host, path: c[2] || '/', httpOnly: true, secure: false, sameSite: 'Lax' }));
}

async function main() {
  const browser = await chromium.launch({
    executablePath: findChromium(), headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
  });
  const cookies = readJar(COOKIES);
  if (cookies.length) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  const marks = {};
  const mark = (k) => { marks[k] = Date.now(); log('mark', k); };
  const t0 = Date.now();
  try {
    await page.goto(`${BASE}/mastering`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 20000 });
    mark('page');
    await page.waitForTimeout(1500);
    await page.locator('input[type="file"]').first().setInputFiles(AUDIO);
    mark('upload');
    await page.waitForTimeout(1500);
    // Pick the "Vocal Air / Crisp Highs" preset if it is a clickable option
    const preset = page.getByText(/^Baseline$/).first();
    if (await preset.isVisible().catch(() => false)) { await preset.click(); mark('preset'); await page.waitForTimeout(800); }
    const masterBtn = page.getByRole('button', { name: /^Master with/i }).first();
    await masterBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await masterBtn.click();
    mark('master_click');
    await page.getByText(/^Mastered — /).first().waitFor({ timeout: 120000 });
    mark('mastered');
    await page.getByText(/^Mastered — /).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const eqToggle = page.locator('[data-testid="button-toggle-mastering-eq"]').first();
    if (await eqToggle.isVisible().catch(() => false)) {
      await eqToggle.click(); mark('eq_open');
      await page.waitForTimeout(600);
      // Nudge a couple of bands so the rack visibly responds
      for (const [tid, val] of [['slider-eq-125', 1.5], ['slider-eq-4000', 2], ['slider-eq-8000', 1]]) {
        const s = page.locator(`[data-testid="${tid}"]`).first();
        if (await s.isVisible().catch(() => false)) {
          await s.focus();
          for (let i = 0; i < Math.round(val * 2); i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(90); }
        }
      }
      mark('eq_tweaked');
    }
    const playAfter = page.getByRole('button', { name: /Play .*(After|Mastered)/i }).first();
    if (await playAfter.isVisible().catch(() => false)) { await playAfter.click(); mark('play_after'); }
    await page.waitForTimeout(9000);
    mark('end');
  } finally {
    const video = page.video();
    await ctx.close();
    const p = await video.path();
    const final = path.join(OUT, 'mastering_raw.webm');
    fs.renameSync(p, final);
    const rel = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +((v - t0) / 1000).toFixed(2)]));
    fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(rel, null, 1));
    log('recorded', final, JSON.stringify(rel));
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
