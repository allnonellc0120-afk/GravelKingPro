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

import { mkdirSync, existsSync, writeFileSync } from 'fs';
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

// --- Write export date stamp into the slide data --------------------------
// Cover.tsx reads this file so the rendered PDF shows "Exported Month Year".
const stampPath = resolve(__dirname, '..', 'src', 'data', 'export-stamp.json');
const exportDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
writeFileSync(stampPath, JSON.stringify({ exportDate }, null, 2) + '\n', 'utf8');
console.log(`\n  Export date stamp: ${exportDate}`);

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

  // --- Pre-flight render validation on /allslides ---------------------------
  // All .slide divs must be present and fully rendered before we capture
  // individual screenshots. A missing or zero-height slide means something
  // hasn't finished rendering (fonts, images, CSS animations) and the PDF
  // would be blank or partial without any visible error.
  process.stdout.write(`\n  Pre-flight: loading /allslides to validate render … `);
  const allSlidesUrl = `${baseUrl}/allslides`;
  const allSlidesResponse = await page.goto(allSlidesUrl, { waitUntil: 'networkidle', timeout: 45_000 });
  if (!allSlidesResponse || !allSlidesResponse.ok()) {
    throw new Error(
      `HTTP ${allSlidesResponse?.status() ?? 'no response'} for ${allSlidesUrl} — is the dev server running?`
    );
  }

  // Wait for all images across all slides to finish loading (success or error),
  // but cap each image at IMAGE_SETTLE_TIMEOUT_MS so a stalled CDN asset
  // doesn't hang the process indefinitely — it will be caught as naturalWidth===0.
  const IMAGE_SETTLE_TIMEOUT_MS = 8_000;
  await page.evaluate((timeoutMs) => {
    const settled = (img) => new Promise((res) => {
      if (img.complete) { res(); return; }
      const timer = setTimeout(res, timeoutMs); // fail-open: let naturalWidth check catch it
      img.onload = () => { clearTimeout(timer); res(); };
      img.onerror = () => { clearTimeout(timer); res(); };
    });
    return Promise.all([...document.images].map(settled));
  }, IMAGE_SETTLE_TIMEOUT_MS);

  // Extra settle time for CSS animations and web fonts
  await page.waitForTimeout(1500);

  // Validate the DOM: count, rendered content, and broken/stalled images
  const validationErrors = await page.evaluate((expectedCount) => {
    const errors = [];
    const slideDivs = [...document.querySelectorAll('.slide')];

    // 1. Slide count must match the investor deck
    if (slideDivs.length < expectedCount) {
      errors.push(
        `Expected ${expectedCount} .slide elements in /allslides but found ${slideDivs.length}. ` +
        `React may not have finished rendering.`
      );
      // Can't check individual slides if they're missing — return early
      return errors;
    }

    // Check only the investor slides (first expectedCount elements)
    const investorSlides = slideDivs.slice(0, expectedCount);

    investorSlides.forEach((el, i) => {
      const slideNum = i + 1;

      // 2. Confirm the React slide component actually mounted visible content.
      //    The .slide wrapper has hardcoded style="height:1080px" so its own
      //    getBoundingClientRect() is always non-zero regardless of what the
      //    component rendered. Instead check that at least one descendant
      //    element (beyond the bare .slide div itself) has non-zero client
      //    dimensions — a reliably empty slide has none.
      const hasRenderedContent = [...el.querySelectorAll('*')]
        .some((child) => child.clientWidth > 0 && child.clientHeight > 0);
      if (!hasRenderedContent) {
        errors.push(
          `Slide ${slideNum} has no visible rendered content — ` +
          `the React component may not have mounted or produced only zero-size elements.`
        );
      }

      // 3. Broken/stalled images: failed to load (naturalWidth === 0) OR
      //    still not complete after the settle deadline.
      //    Both cases would produce a blank area in the screenshot.
      const imgs = [...el.querySelectorAll('img')];
      const broken = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
      if (broken.length > 0) {
        const srcs = broken.map((img) => img.src || img.currentSrc || '(no src)').join(', ');
        errors.push(
          `Slide ${slideNum} has ${broken.length} broken or stalled image(s): ${srcs}`
        );
      }
    });

    return errors;
  }, INVESTOR_SLIDES.length);

  if (validationErrors.length > 0) {
    process.stdout.write('FAILED\n\n');
    console.error('  ERROR: Render validation failed — PDF export aborted.\n');
    for (const err of validationErrors) {
      console.error(`    ✗ ${err}`);
    }
    console.error(
      '\n  Fix the issues above (check the dev server logs, image URLs, and CSS)' +
      '\n  then re-run the export.\n'
    );
    process.exit(1);
  }

  process.stdout.write(`OK (${INVESTOR_SLIDES.length} slides validated)\n\n`);

  // --- Per-slide screenshot capture -----------------------------------------
  for (const slide of INVESTOR_SLIDES) {
    const url = `${baseUrl}/slide${slide.position}`;
    process.stdout.write(`  [${slide.position}/${INVESTOR_SLIDES.length}] ${slide.title} … `);

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() ?? 'no response'} for ${url} — is the dev server running?`);
    }

    // Wait for all images in this slide to load (bounded: stalled assets caught below)
    await page.evaluate((timeoutMs) => {
      const settled = (img) => new Promise((res) => {
        if (img.complete) { res(); return; }
        const timer = setTimeout(res, timeoutMs);
        img.onload = () => { clearTimeout(timer); res(); };
        img.onerror = () => { clearTimeout(timer); res(); };
      });
      return Promise.all([...document.images].map(settled));
    }, 8_000);

    // Settle fonts and CSS transitions
    await page.waitForTimeout(600);

    // Confirm the slide component actually mounted visible content.
    // NOTE: /slideN renders through SlideEditor — there is no .slide wrapper
    // on individual slide pages (that class exists only on /allslides).
    // SlideEditor renders: <div class="select-none"> → <div style="display:block">
    // → <slide.Component />.  We find the active (block) wrapper and verify at
    // least one of its descendants has non-zero client dimensions.
    const hasRenderedContent = await page.evaluate(() => {
      const activeWrapper = document.querySelector('.select-none > div[style*="block"]');
      if (!activeWrapper) return false;
      return [...activeWrapper.querySelectorAll('*')]
        .some((el) => el.clientWidth > 0 && el.clientHeight > 0);
    });
    if (!hasRenderedContent) {
      throw new Error(
        `Slide ${slide.position} ("${slide.title}") has no visible rendered content on ` +
        `/slide${slide.position} — the React component may not have mounted. ` +
        `Aborting export.`
      );
    }

    // Check for broken/stalled images on this individual slide page.
    // Flag both failed images (naturalWidth === 0) AND images that are still
    // not complete after the settle deadline — both would appear blank.
    const brokenImages = await page.evaluate(() => {
      return [...document.images]
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.src || img.currentSrc || '(no src)');
    });
    if (brokenImages.length > 0) {
      throw new Error(
        `Slide ${slide.position} ("${slide.title}") has ${brokenImages.length} broken image(s): ` +
        brokenImages.join(', ') +
        ` — aborting export to prevent a blank/partial slide in the PDF.`
      );
    }

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
