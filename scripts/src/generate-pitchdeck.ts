import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";

async function createPitchDeck() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageW = 1080;
  const pageH = 608;
  const margin = 64;
  const textW = pageW - margin * 2;
  let y = pageH - margin;

  const accent = rgb(0.96, 0.69, 0.0);
  const dark = rgb(0.07, 0.07, 0.08);
  const panelBg = rgb(0.12, 0.12, 0.14);
  const textLight = rgb(0.5, 0.5, 0.5);
  const white = rgb(1, 1, 1);
  const green = rgb(0.06, 0.72, 0.48);
  const red = rgb(0.94, 0.27, 0.27);

  function addSlide() {
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: dark });
    page.drawRectangle({ x: 0, y: pageH - 5, width: pageW, height: 5, color: accent });
    y = pageH - margin;
    return page;
  }

  function drawWrappedText(page: any, text: string, x: number, options: any = {}) {
    const { font: f = font, size = 14, color = white } = options;
    const words = text.split(" ");
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      const testWidth = f.widthOfTextAtSize(testLine, size);
      if (testWidth > textW) {
        if (currentLine) {
          page.drawText(currentLine, { x, y, size, font: f, color });
          y -= size + 2;
          currentLine = word;
        } else {
          page.drawText(testLine, { x, y, size, font: f, color });
          y -= size + 2;
          currentLine = "";
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      page.drawText(currentLine, { x, y, size, font: f, color });
      y -= size + 2;
    }
  }

  function drawSlideHeader(page: any, text: string, size = 28) {
    if (y < 150) { page = addSlide(); }
    page.drawText(text, { x: margin, y, size, font: fontBold, color: accent });
    y -= size + 8;
  }

  function drawSlideSub(page: any, text: string, size = 18) {
    if (y < 150) { page = addSlide(); }
    page.drawText(text, { x: margin, y, size, font: fontBold, color: white });
    y -= size + 8;
  }

  function drawSlideBody(page: any, text: string, size = 14) {
    if (y < 150) { page = addSlide(); }
    drawWrappedText(page, text, margin, { size, color: white });
    y -= 12;
  }

  function drawTwoCol(page: any, left: string, right: string, leftColor: any, rightColor: any) {
    if (y < 200) { page = addSlide(); }
    const colY = y - 120;
    const colW = (textW - 24) / 2;

    page.drawRectangle({ x: margin, y: colY, width: colW, height: 120, color: panelBg });
    page.drawRectangle({ x: margin + colW + 24, y: colY, width: colW, height: 120, color: panelBg });

    page.drawLine({ start: { x: margin + 4, y: colY + 116 }, end: { x: margin + 80, y: colY + 116 }, color: red, thickness: 2 });
    page.drawLine({ start: { x: margin + colW + 28, y: colY + 116 }, end: { x: margin + colW + 104, y: colY + 116 }, color: green, thickness: 2 });

    page.drawText("Raw Audio", { x: margin + 12, y: colY + 92, size: 14, font: fontBold, color: textLight });
    page.drawText("MLK v3", { x: margin + colW + 36, y: colY + 92, size: 14, font: fontBold, color: accent });

    page.drawText(left, { x: margin + 12, y: colY + 56, size: 22, font: fontBold, color: leftColor });
    page.drawText(right, { x: margin + colW + 36, y: colY + 56, size: 22, font: fontBold, color: rightColor });

    y -= 140;
  }

  // ===== SLIDE 1: TITLE =====
  let page = addSlide();
  page.drawText("GRAVELKING PRO", { x: margin, y: pageH - 180, size: 48, font: fontBold, color: white });
  page.drawText("The Pitch", { x: margin, y: pageH - 232, size: 36, font: fontBold, color: accent });
  page.drawText("Professional Audio Processing for the Modern Artist", { x: margin, y: pageH - 280, size: 18, font: font, color: white });
  page.drawText("Kevin Morris, Chief Architect | All N One LLC", { x: margin, y: margin + 30, size: 12, font: font, color: textLight });
  page.drawText("June 2026", { x: margin, y: margin + 14, size: 12, font: font, color: textLight });

  // ===== SLIDE 2: THE PROBLEM =====
  page = addSlide();
  drawSlideHeader(page, "The Problem");
  drawSlideBody(page, "Raw audio is unpredictable. Peaks overshoot. Loudness drifts. Tracks that sounded great in the studio clip on the streaming platform.");
  drawSlideBody(page, "Traditional compressors and limiters solve this, but they introduce artifacts: pumping, breathing, loss of transients, and phase distortion.");
  drawSlideBody(page, "The modern artist needs a signal processor that is fast, transparent, and mathematically verified, without the tradeoffs of legacy tools.");

  // ===== SLIDE 3: THE SOLUTION =====
  page = addSlide();
  drawSlideHeader(page, "The Solution: MLK v3");
  drawSlideBody(page, "MLK v3, the Morris Law Kernel V3, is a multi-band amplitude carving engine with three parallel processing stages and adaptive normalization.");
  drawSlideBody(page, "Three frequency bands receive independent carving: bass is boosted, mid is preserved, high is controlled. After phase-coherent recombination, the signal is normalized to a 0.92 peak ceiling.");
  drawSlideBody(page, "No clipping. No artifacts. No guesswork. Just a verified, broadcast-ready output every single time.");

  // ===== SLIDE 4: THE NUMBERS =====
  page = addSlide();
  drawSlideHeader(page, "Raw vs. MLK v3: The Numbers");
  drawTwoCol(page, "0.95 Peak", "0.92 Peak", red, green);
  drawTwoCol(page, "Unverified", "VALIDATED", red, green);
  drawTwoCol(page, "~0x Real-time", "6.7x Real-time", red, green);
  drawTwoCol(page, "96.8% Headroom", "100% Headroom", red, green);

  // ===== SLIDE 5: THE PRODUCT =====
  page = addSlide();
  drawSlideHeader(page, "GravelKing Pro: The Product");
  drawSlideBody(page, "Kernel Dashboard - Real-time MLK v3 processing with live telemetry and before/after comparison.");
  drawSlideBody(page, "Audio Studio - Upload and process your own tracks with MLK v3 applied. Full WAV downloads.");
  drawSlideBody(page, "Mix Studio - Full multi-track DAW with synchronized zoom, waveform scrubbing, and MLK v3 on every export.");
  drawSlideBody(page, "One-Click Master - Automatic mastering with MLK v3 normalization. Instant broadcast-ready output.");
  drawSlideBody(page, "Stem Separation - AI-powered voice removal and stem splitting. Free-tier preview, unlimited for Studio.");

  // ===== SLIDE 6: THE BRAND =====
  page = addSlide();
  drawSlideHeader(page, "The Brand: GravelKing");
  drawSlideBody(page, "Kevin Morris, Chief Architect. Over 1,500 tracks produced. Born in Louisiana, raised in a musical family, two retired-professional older brothers.");
  drawSlideBody(page, "The name GravelKing came from fellow artists who noticed the raw grit in Kevin's voice. It stuck. It became the brand.");
  drawSlideBody(page, "Today, Kevin performs live on StarMaker as KevJamm84 at The Juke Joint party room, Friday and Saturday nights at 8 PM CST.");
  drawSlideBody(page, "The grit that earned the name is the same grit that built MLK v3.");

  // ===== SLIDE 7: THE ASK =====
  page = addSlide();
  drawSlideHeader(page, "The Opportunity");
  drawSlideBody(page, "GravelKing Pro is built for the modern artist who needs professional-grade audio processing without the studio price tag.");
  drawSlideBody(page, "Starter (Free): Basic analysis, standard reports.");
  drawSlideBody(page, "Pro ($39.99/month): Full real-time metrics, unlimited runs, PDF reports, WAV downloads, priority support.");
  drawSlideBody(page, "Node Auditor ($499/month): Enterprise benchmarking, 1T scale, Morris Law V2 access.");
  drawSlideBody(page, "Download GravelKing Pro at gravelkingpro.it.com.");

  // ===== FOOTER =====
  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = pdfDoc.getPage(i);
    p.drawText("GravelKing Productions | All N One LLC", { x: margin, y: 20, size: 10, font, color: textLight });
    p.drawText(`${i + 1} / ${pageCount}`, { x: pageW - margin - 40, y: 20, size: 10, font, color: textLight });
  }

  const pdfBytes = await pdfDoc.save();
  const outPath = "artifacts/gravelkingpro/public/GravelKingPro_MLKv3_PitchDeck.pdf";
  fs.mkdirSync("artifacts/gravelkingpro/public", { recursive: true });
  fs.writeFileSync(outPath, pdfBytes);
  console.log(`Pitch deck generated: ${outPath} (${pdfBytes.length} bytes)`);
}

createPitchDeck().catch((err) => {
  console.error("Pitch deck generation failed:", err);
  process.exit(1);
});
