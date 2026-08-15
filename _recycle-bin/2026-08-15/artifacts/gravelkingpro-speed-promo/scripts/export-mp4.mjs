#!/usr/bin/env node
/**
 * Export the GravelKing Pro promo to a downloadable 1920x1080 MP4 with mixed audio.
 * Usage: node scripts/export-mp4.mjs [output.mp4]
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.resolve(root, 'dist/public');
const output = path.resolve(root, process.argv[2] || 'public/videos/gravelkingpro_pitch_228.mp4');
const tmpDir = path.resolve(root, '.tmp-export');
fs.mkdirSync(tmpDir, { recursive: true });

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_MS = 228500; // matches SCENE_DURATIONS total

const SCENE_STARTS_MS = {
  intro: 0,
  hook: 19500,
  problem: 35500,
  technology: 61000,
  product: 86500,
  market: 112000,
  revenue: 137500,
  moat: 175500,
  ask: 201000,
};

const SCENE_VO = {
  intro: 'audio/vo_intro.mp3',
  hook: 'audio/vo_hook.mp3',
  problem: 'audio/vo_problem.mp3',
  technology: 'audio/vo_technology.mp3',
  product: 'audio/vo_product.mp3',
  market: 'audio/vo_market.mp3',
  revenue: 'audio/vo_revenue.mp3',
  moat: 'audio/vo_moat.mp3',
  ask: 'audio/vo_ask.mp3',
};

const CANDIDATE_CHROMIUMS = [
  '/nix/store/hvv3n9pvjfq0x8wjw8f3igsyvlaz1ngr-playwright-browsers-chromium/chromium-1091/chrome-linux/chrome',
  '/nix/store/gn1jv0wpg8zq97a48bqd5k5ck8hf0n2y-playwright-browsers-chromium/chromium-1048/chrome-linux/chrome',
  '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
];

function findChromium() {
  try {
    const fromPath = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
    if (fromPath) return fromPath;
  } catch {}
  const found = CANDIDATE_CHROMIUMS.find(p => fs.existsSync(p));
  if (found) return found;
  return undefined;
}

async function startStaticServer() {
  const basePath = '/gravelkingpro-promo/';
  const server = createServer((req, res) => {
    let url = new URL(req.url, 'http://localhost').pathname;
    if (!url.startsWith(basePath)) {
      res.writeHead(404); res.end('not found'); return;
    }
    url = url.slice(basePath.length - 1); // keep leading slash
    if (url === '/') url = '/index.html';
    const file = path.join(dist, url);
    if (!file.startsWith(dist)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
        '.json': 'application/json', '.woff2': 'font/woff2',
      }[ext] || 'application/octet-stream';
      const headers = { 'Content-Type': ct, 'Accept-Ranges': 'bytes' };
      const range = req.headers.range;
      if (range && ct.startsWith('audio/')) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = end - start + 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = chunksize;
        res.writeHead(206, headers);
        const stream = fs.createReadStream(file, { start, end });
        stream.pipe(res);
        return;
      }
      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise(r => server.listen(5000, '127.0.0.1', r));
  return server;
}

async function mixAudio() {
  const audioPath = path.join(tmpDir, 'audio.m4a');
  const soundtrack = path.join(root, 'public/audio/gravelking_pro_soundtrack.mp3');
  const inputs = ['-i', soundtrack];
  const labels = [];
  const delays = [];

  // Background loop: 0.1 volume as in the player.
  labels.push('[0:a]aloop=loop=-1:size=119980375,atrim=0:228.5,asetpts=PTS-STARTPTS,volume=0.1[bg]');
  delays.push('[bg]');

  let inputIdx = 1;
  for (const [key, startMs] of Object.entries(SCENE_STARTS_MS)) {
    const file = path.join(root, 'public', SCENE_VO[key]);
    inputs.push('-i', file);
    labels.push(`[${inputIdx}:a]adelay=${startMs}|${startMs},asetpts=PTS-STARTPTS[${key}]`);
    delays.push(`[${key}]`);
    inputIdx++;
  }

  const totalInputs = inputIdx; // 1 bg + 9 vo
  const filter = `${labels.join(';')};${delays.join('')}amix=inputs=${totalInputs}:normalize=0:duration=longest`;

  execFileSync('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', filter,
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    audioPath,
  ], { stdio: 'inherit' });
  return audioPath;
}

async function recordVideo() {
  const server = await startStaticServer();
  const chromiumPath = findChromium();
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: tmpDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5000/gravelkingpro-promo/?export=1', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the first frame to render.
  await page.waitForTimeout(1000);

  // Ensure audio is unmuted and playing (in case autoplay was blocked).
  await page.evaluate(() => {
    document.querySelectorAll('audio').forEach(a => {
      a.muted = false;
      a.play().catch(() => {});
    });
  });

  // Record for the full duration, logging progress so the job doesn't look hung.
  const start = Date.now();
  while (Date.now() - start < DURATION_MS) {
    const elapsed = Date.now() - start;
    const pct = Math.min(100, Math.round((elapsed / DURATION_MS) * 100));
    console.log(`Recording progress: ${pct}% (${(elapsed / 1000).toFixed(1)}s / ${DURATION_MS / 1000}s)`);
    await page.waitForTimeout(Math.min(10000, DURATION_MS - elapsed));
  }
  await page.waitForTimeout(500);
  await ctx.close();
  await browser.close();
  await new Promise((r, e) => server.close(err => (err ? e(err) : r())));

  const videoFile = fs.readdirSync(tmpDir).find(f => f.endsWith('.webm'));
  if (!videoFile) throw new Error('No recorded video file found');
  return path.join(tmpDir, videoFile);
}

async function combine(videoPath, audioPath) {
  execFileSync('ffmpeg', [
    '-y', '-i', videoPath, '-i', audioPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-movflags', '+faststart',
    output,
  ], { stdio: 'inherit' });
}

async function main() {
  console.log('Mixing audio...');
  const audioPath = await mixAudio();
  console.log('Audio:', audioPath);

  console.log('Recording video at 1920x1080, 30fps for', DURATION_MS / 1000, 's...');
  const videoPath = await recordVideo();
  console.log('Video:', videoPath);

  console.log('Combining into MP4...');
  await combine(videoPath, audioPath);
  console.log('Done:', output);

  // Clean up temp files.
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
