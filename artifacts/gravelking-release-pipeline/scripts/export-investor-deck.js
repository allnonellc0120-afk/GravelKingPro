#!/usr/bin/env node
/**
 * export-investor-deck.js
 *
 * Generates the F6S investor deck PDF from the current slide renderer.
 * Run this before every F6S upload or investor email push.
 *
 * Usage (from repo root):
 *   pnpm --filter @workspace/gravelking-release-pipeline export-deck
 *
 * Requirements:
 *   PORT must be set to the port where the slide dev server is listening.
 *   The workflow sets PORT automatically; when running manually, pass it:
 *     PORT=5173 pnpm --filter @workspace/gravelking-release-pipeline export-deck
 *
 *   If the dev server is not running, start it first in another terminal:
 *     pnpm --filter @workspace/gravelking-release-pipeline run dev
 *
 * What it does:
 *   1. Navigates to each /slideN URL in the running dev server
 *   2. Takes a 1920×1080 screenshot per slide (images + fonts settled)
 *   3. Stitches all screenshots into a single landscape PDF
 *   4. Writes the result to .local/outputs/
 *
 * Dependencies: playwright, pdf-lib (declared in devDependencies)
 */

import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const outputDir = resolve(repoRoot, '.local', 'outputs');
const outputPath = resolve(outputDir, 'GravelKing-Productions-F6S-Investor-Deck.pdf');

// Build the URL before any early exits so it is always available for instructions.
const BASE_PATH = (process.env.BASE_PATH || '/gravelking-release-pipeline').replace(/\/$/, '');
const PORT = process.env.PORT;
const baseUrl = PORT ? `http://localhost:${PORT}${BASE_PATH}` : `http://localhost:<PORT>${BASE_PATH}`;

// --- PORT guard -----------------------------------------------------------
if (!PORT) {
  console.error(
    '\n  ERROR: PORT is not set.\n\n' +
    '  Start the slide dev server and note the port it prints, then:\n' +
    '    PORT=<port> pnpm --filter @workspace/gravelking-release-pipeline export-deck\n'
  );
  printManualInstructions();
  process.exit(1);
}

// Ensure output directory exists
mkdirSync(outputDir, { recursive: true });

// --- Load playwright ------------------------------------------------------
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n  ERROR: playwright is not installed.\n' +
    '  Install it with:\n' +
    '    pnpm add -D playwright --filter @workspace/gravelking-release-pipeline\n'
  );
  printManualInstructions();
  process.exit(1);
}

// --- Load pdf-lib ---------------------------------------------------------
let PDFDocument, rgb;
try {
  ({ PDFDocument, rgb } = await import('pdf-lib'));
} catch {
  console.error(
    '\n  ERROR: pdf-lib is not installed.\n' +
    '  Install it with:\n' +
    '    pnpm add -D pdf-lib --filter @workspace/gravelking-release-pipeline\n'
  );
  process.exit(1);
}

// --- Load slide manifest to know how many slides to render ----------------
const manifestPath = resolve(__dirname, '..', 'src', 'data', 'slides-manifest.json');
let manifest;
try {
  const { readFileSync } = await import('fs');
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  console.error(`\n  ERROR: Could not read slides manifest at ${manifestPath}\n`);
  process.exit(1);
}

// Sort by position and collect slide URLs (excluding the internal checklist slide
// at position 12 which is operator-only and should not appear in the F6S deck).
const INVESTOR_SLIDES = manifest
  .filter((s) => s.position <= 11)   // positions 1–11 are the investor-facing deck
  .sort((a, b) => a.position - b.position);

if (INVESTOR_SLIDES.length === 0) {
  console.error('\n  ERROR: No investor slides found in the manifest.\n');
  process.exit(1);
}

console.log(`\n  Rendering ${INVESTOR_SLIDES.length} slides from ${baseUrl} …`);

// Prefer the nix-store Chromium that ships in this environment (avoids a
// missing-library crash with the playwright-bundled headless shell on NixOS).
const NIX_CHROMIUM =
  '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const launchOpts = {
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  ...(existsSync(NIX_CHROMIUM) ? { executablePath: NIX_CHROMIUM } : {}),
};

const browser = await chromium.launch(launchOpts);
const screenshots = [];
let pdfGenerated = false;

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  for (const slide of INVESTOR_SLIDES) {
    const url = `${baseUrl}/slide${slide.position}`;
    process.stdout.write(`  [${slide.position}/${INVESTOR_SLIDES.length}] ${slide.title} … `);

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() ?? 'no response'} for ${url} — is the dev server running?`);
    }

    // Wait for all images in this slide to load
    await page.evaluate(() =>
      Promise.all(
        [...document.images]
          .filter((img) => !img.complete)
          .map((img) => new Promise((res) => { img.onload = res; img.onerror = res; }))
      )
    );

    // Settle fonts and CSS transitions
    await page.waitForTimeout(600);

    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    screenshots.push(png);
    process.stdout.write('✓\n');
  }

  // --- Stitch screenshots into a PDF with pdf-lib ---------------------------
  process.stdout.write('\n  Building PDF … ');
  const pdfDoc = await PDFDocument.create();

  for (const png of screenshots) {
    const img = await pdfDoc.embedPng(png);
    // Use 1920×1080 pt page (matching the slide dimensions exactly)
    const page = pdfDoc.addPage([1920, 1080]);
    page.drawImage(img, { x: 0, y: 0, width: 1920, height: 1080 });
  }

  const { writeFileSync } = await import('fs');
  writeFileSync(outputPath, await pdfDoc.save());

  pdfGenerated = true;
  process.stdout.write('done\n');
  console.log(`\n  ✓ Investor deck saved (${INVESTOR_SLIDES.length} slides):\n    ${outputPath}\n`);
  console.log('  Next steps:');
  console.log('    1. Open the PDF and spot-check pricing + CTA URL against the live site');
  console.log('    2. Log in to F6S → Edit Application → Upload Pitch Deck');
  console.log('    3. Overwrite with the new file; verify the preview renders before saving');
  console.log('    4. Update any saved outreach email templates that link the old file URL\n');
} finally {
  await browser.close();
  if (!pdfGenerated) {
    console.error('\n  Export failed — no PDF was written. See the error above.\n');
    process.exit(1);
  }
}

function printManualInstructions() {
  console.log(
    '\n  ── Manual export instructions ──────────────────────────────────────\n' +
    `\n  1. Open the slide renderer in Chrome:\n     ${baseUrl}/slide1\n` +
    '\n  2. For each slide, File → Print (Ctrl+P / Cmd+P)\n' +
    '     • Destination: Save as PDF\n' +
    '     • Layout: Landscape   •   Margins: None   •   Background graphics: ON\n' +
    '\n  Or open /allslides and print the whole deck at once:\n' +
    `     ${baseUrl}/allslides\n` +
    '\n  3. Save to:\n' +
    `     ${outputPath}\n` +
    '\n  4. Upload to F6S → Edit Application → Pitch Deck\n' +
    '\n  ─────────────────────────────────────────────────────────────────────\n'
  );
}
