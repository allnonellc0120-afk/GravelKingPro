#!/usr/bin/env node
/**
 * Export the GravelKing Pro Lyrics Generator promo to MP4.
 * Usage: node scripts/export-mp4.mjs [output.mp4] [vertical]
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
const isVertical = process.argv[3] === 'vertical';
const isWorkflow = process.argv[3] === 'workflow';
const isLogo = process.argv[3] === 'logo';

let output = process.argv[2];
if (!output) {
  if (isLogo) {
    output = 'public/videos/gravelkingpro_logo_4x5.mp4';
  } else if (isWorkflow) {
    output = 'public/videos/gravelkingpro_workflow_45s_4x5.mp4';
  } else if (isVertical) {
    output = 'public/videos/gravelkingpro_lyrics_generator_59s_9x16.mp4';
  } else {
    output = 'public/videos/gravelkingpro_lyrics_generator_59s_16x9.mp4';
  }
}
output = path.resolve(root, output);

const tmpDir = path.resolve(root, '.tmp-export');
fs.mkdirSync(tmpDir, { recursive: true });
for (const entry of fs.readdirSync(tmpDir)) {
  fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
}

let WIDTH = 1920;
let HEIGHT = 1080;
let DURATION_MS = 59000;

if (isLogo) {
  WIDTH = 1080;
  HEIGHT = 1350;
  DURATION_MS = 8000;
} else if (isWorkflow) {
  WIDTH = 1080;
  HEIGHT = 1350;
  DURATION_MS = 45000;
} else if (isVertical) {
  WIDTH = 1080;
  HEIGHT = 1920;
}

const SCALED_WIDTH = WIDTH;
const SCALED_HEIGHT = HEIGHT;
const FPS = 30;
const SLOWDOWN_FACTOR = 1.05;
const RECORD_DURATION_MS = DURATION_MS * SLOWDOWN_FACTOR;
const EXPORT_PORT = Number(process.env.EXPORT_PORT || 5001);

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
  const basePath = '/';
  const server = createServer((req, res) => {
    let url = new URL(req.url, 'http://localhost').pathname;
    if (!url.startsWith(basePath)) {
      res.writeHead(404); res.end('not found'); return;
    }
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
  await new Promise(r => server.listen(EXPORT_PORT, '127.0.0.1', r));
  return server;
}

async function mixAudio() {
  const audioPath = path.join(tmpDir, 'audio.m4a');
  const soundtrack = path.join(root, 'public/audio/gravelking_pro_soundtrack_warm.mp3');
  
  if (isWorkflow) {
    execFileSync('ffmpeg', [
      '-y', '-stream_loop', '-1', '-i', soundtrack,
      '-t', '45',
      '-filter_complex', `
        [0:a]volume=0.15,
        bass=g=4:f=115:w=0.8,
        equalizer=f=3200:t=q:w=1.0:g=1.5,
        treble=g=2:f=9000:w=0.7,
        acompressor=threshold=-18dB:ratio=2.4:attack=8:release=120:makeup=2,
        loudnorm=I=-16:TP=-1.5:LRA=9,
        afade=t=in:st=0:d=0.5,afade=t=out:st=43.5:d=1.5[aout]
      `,
      '-map', '[aout]',
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      audioPath,
    ], { stdio: 'inherit' });
  } else {
    execFileSync('ffmpeg', [
      '-y', '-stream_loop', '-1', '-i', soundtrack, 
      '-i', path.join(root, 'public/audio/jax_vo1.mp3'),
      '-i', path.join(root, 'public/audio/jax_vo2.mp3'),
      '-i', path.join(root, 'public/audio/jax_vo3.mp3'),
      '-i', path.join(root, 'public/audio/jax_vo4.mp3'),
      '-i', path.join(root, 'public/audio/jax_vo5.mp3'),
      '-i', path.join(root, 'public/audio/jax_vo6.mp3'),
      '-t', '59',
      '-filter_complex', `
        [0:a]volume=0.15,afade=t=in:st=0:d=0.5,afade=t=out:st=57.5:d=1.5[music];
        [1:a]adelay=0|0,volume=1.0[v1];
        [2:a]adelay=7000|7000,volume=1.0[v2];
        [3:a]adelay=17000|17000,volume=1.0[v3];
        [4:a]adelay=26000|26000,volume=1.0[v4];
        [5:a]adelay=42000|42000,volume=1.0[v5];
        [6:a]adelay=51000|51000,volume=1.0[v6];
        [music][v1][v2][v3][v4][v5][v6]amix=inputs=7:duration=first:dropout_transition=2[aout]
      `,
      '-map', '[aout]',
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      audioPath,
    ], { stdio: 'inherit' });
  }
  return audioPath;
}

async function recordVideo() {
  const server = await startStaticServer();
  const chromiumPath = findChromium();
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: tmpDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await ctx.newPage();
  
  await page.addInitScript(`
    const _setTimeout = window.setTimeout;
    window.setTimeout = (cb, ms, ...args) => _setTimeout(cb, (ms || 0) * ${SLOWDOWN_FACTOR}, ...args);
    const _setInterval = window.setInterval;
    window.setInterval = (cb, ms, ...args) => _setInterval(cb, (ms || 0) * ${SLOWDOWN_FACTOR}, ...args);
    setInterval(() => {
      document.querySelectorAll('video, audio').forEach(v => {
        if (v.playbackRate !== 1 / ${SLOWDOWN_FACTOR}) v.playbackRate = 1 / ${SLOWDOWN_FACTOR};
      });
    }, 100);
  `);
  
  const client = await page.context().newCDPSession(page);
  await client.send('Animation.enable');
  await client.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOWDOWN_FACTOR });

  const formatQuery = isLogo ? '&video=default' : (isWorkflow ? '&video=workflow' : (isVertical ? '&format=vertical' : ''));
  page.on('pageerror', error => console.error('Browser page error:', error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('Browser console error:', message.text());
  });
  // Playwright starts recording as soon as the context is created. Paint a
  // dark pre-roll first so the exported MP4 never begins on the browser's
  // unpainted white navigation frame.
  await page.setContent('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;background:#050608}</style></head><body></body></html>');
  await page.waitForTimeout(250);
  await page.goto(`http://127.0.0.1:${EXPORT_PORT}/?export=1${formatQuery}`, { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for the first frame to render.
  await page.waitForTimeout(1000);
  const rootText = await page.locator('#root').innerText().catch(() => '');
  if (!rootText.trim()) throw new Error('Export page rendered no visible scene content');

  // Ensure audio is unmuted and playing (in case autoplay was blocked).
  await page.evaluate(() => {
    document.querySelectorAll('audio').forEach(a => {
      a.muted = false;
      a.play().catch(() => {});
    });
  });

  // Record for the full duration, logging progress so the job doesn't look hung.
  const start = Date.now();
  while (Date.now() - start < RECORD_DURATION_MS) {
    const elapsed = Date.now() - start;
    const pct = Math.min(100, Math.round((elapsed / RECORD_DURATION_MS) * 100));
    console.log(`Recording progress: ${pct}% (${(elapsed / 1000).toFixed(1)}s / ${RECORD_DURATION_MS / 1000}s)`);
    await page.waitForTimeout(Math.min(1000, RECORD_DURATION_MS - elapsed));
  }
  await page.waitForTimeout(500);
  try { await ctx.close(); } catch {}
  try { await browser.close(); } catch {}
  await new Promise((r, e) => server.close(err => (err ? e(err) : r())));

  const videoFile = fs.readdirSync(tmpDir).find(f => f.endsWith('.webm'));
  if (!videoFile) throw new Error('No recorded video file found');
  return path.join(tmpDir, videoFile);
}

async function combine(videoPath, audioPath) {
  const durationArg = String(DURATION_MS / 1000);
  execFileSync('ffmpeg', [
    '-y', '-i', videoPath, '-i', audioPath,
    '-filter_complex', `[0:v]setpts=(1/${SLOWDOWN_FACTOR})*PTS,scale=${SCALED_WIDTH}:${SCALED_HEIGHT}:flags=lanczos[v]`,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-threads', '4',
    '-profile:v', 'high', '-level', '4.2',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
    '-t', durationArg,
    '-movflags', '+faststart',
    output,
  ], { stdio: 'inherit' });
}

async function main() {
  console.log('Mixing audio...');
  const audioPath = await mixAudio();
  console.log('Audio:', audioPath);

  console.log(`Recording video at ${WIDTH}x${HEIGHT}, 30fps for`, DURATION_MS / 1000, 's...');
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
