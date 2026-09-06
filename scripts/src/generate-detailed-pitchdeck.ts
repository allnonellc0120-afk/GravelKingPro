import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import fs from "fs";
import path from "path";

const accent = rgb(0.788, 0.635, 0.153);
const dark = rgb(0.031, 0.031, 0.031);
const white = rgb(1, 1, 1);
const gray = rgb(0.267, 0.267, 0.267);
const lightGray = rgb(0.6, 0.6, 0.6);
const offWhite = rgb(0.98, 0.98, 0.98);
const red = rgb(0.82, 0.2, 0.2);
const green = rgb(0.13, 0.64, 0.42);

const pageW = PageSizes.A4[0];
const pageH = PageSizes.A4[1];
const margin = 42;
const contentW = pageW - margin * 2;

const imgDir = path.resolve(import.meta.dirname, "../../screenshots");
const outDir = path.resolve(import.meta.dirname, "../../artifacts/gravelkingpro/public");

const bold = StandardFonts.HelveticaBold;
const font = StandardFonts.Helvetica;
const italic = StandardFonts.HelveticaOblique;

async function createDetailedPitchDeck() {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(font);
  const fb = await pdf.embedFont(bold);
  const fi = await pdf.embedFont(italic);

  let page!: ReturnType<typeof pdf.addPage>;
  let y: number;

  function newPage(bg = white) {
    page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bg });
    y = pageH - margin;
    return page;
  }

  function drawText(t: string, size: number, color = gray, fontFace = f, x = margin, w = contentW, lineHeight?: number) {
    const lh = lineHeight ?? size * 1.35;
    const words = t.split(" ");
    let line = "";
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (fontFace.widthOfTextAtSize(test, size) > w) {
        if (line) {
          page.drawText(line, { x, y: cy, size, font: fontFace, color });
          cy -= lh;
          line = word;
        } else {
          page.drawText(word, { x, y: cy, size, font: fontFace, color });
          cy -= lh;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x, y: cy, size, font: fontFace, color });
      cy -= lh;
    }
    y = cy;
  }

  function heading(h: string, color = accent, size = 26) {
    drawText(h, size, color, fb, margin, contentW, size * 1.2);
    y -= 6;
  }

  function subheading(h: string, color = dark) {
    drawText(h, 13, color, fb, margin, contentW, 18);
    y -= 4;
  }

  function body(t: string, color = gray) {
    drawText(t, 11, color, f, margin, contentW, 16);
  }

  function bullet(items: string[]) {
    for (const item of items) {
      page.drawText("•", { x: margin, y, size: 10, font: fb, color: accent });
      const textY = y;
      y -= 2;
      drawText(item, 10, gray, f, margin + 14, contentW - 14, 15);
      if (y >= textY - 2) y = textY - 18;
    }
  }

  async function addImage(name: string, maxH = 260) {
    const filePath = path.join(imgDir, name);
    if (!fs.existsSync(filePath)) return false;
    const bytes = fs.readFileSync(filePath);
    let img;
    if (name.endsWith(".png")) img = await pdf.embedPng(bytes);
    else img = await pdf.embedJpg(bytes);
    const scale = Math.min(contentW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    if (y - h < margin + 40) { newPage(); }
    page.drawImage(img, { x: margin + (contentW - w) / 2, y: y - h, width: w, height: h });
    y -= h + 14;
    return true;
  }

  function footer(isDark = false) {
    const c = isDark ? lightGray : gray;
    page.drawText("GravelKing Pro · Confidential Investor Pitch · All N One LLC", { x: margin, y: 20, size: 8, font: f, color: c });
  }

  function pageNumber(n: number, total: number) {
    page.drawText(`${n} / ${total}`, { x: pageW - margin - 24, y: 20, size: 8, font: f, color: gray });
  }

  const pages: { build: () => Promise<void>; dark?: boolean }[] = [];
  let pageIdx = 0;

  // 1. COVER
  pages.push({
    dark: true,
    build: async () => {
      newPage(dark);
      page.drawText("GRAVELKING PRO", { x: margin, y: pageH - 160, size: 40, font: fb, color: white });
      page.drawText("The Music Industry Has a Rights Crisis.", { x: margin, y: pageH - 215, size: 22, font: fb, color: white });
      page.drawText("We Built the Proof — And the Platform That Captures It.", { x: margin, y: pageH - 250, size: 14, font: f, color: lightGray });
      page.drawText("High-Performance Sales Tactic: Lead with the Liability, Not the Feature.", { x: margin, y: pageH - 320, size: 12, font: fb, color: accent });
      body("Every distributor, label, and attorney will soon need chain-of-title documentation for AI-assisted music. GravelKing Pro is the only live platform that produces it automatically while the artist creates. We do not sell a DAW. We sell legal protection against a $200M-problem tidal wave.");
      page.drawText("gravelkingpro.com", { x: margin, y: 70, size: 11, font: fb, color: accent });
      footer(true);
    },
  });

  // 2. THE PROBLEM
  pages.push({
    build: async () => {
      newPage();
      heading("The Problem: 200 Million Unprotected Tracks");
      body("In 2024, an estimated 200 million AI-generated tracks were uploaded to streaming platforms. The U.S. Copyright Office has made its position clear: works produced solely by a machine without human creative input do not qualify for copyright protection.");
      y -= 12;
      subheading("The legal gap creates three commercial problems:");
      bullet([
        "Artists cannot protect AI-assisted music without provable human contribution.",
        "Distributors face liability when they cannot verify chain-of-title.",
        "Labels and publishers cannot safely sign or sync AI-assisted catalogs.",
      ]);
      y -= 20;
      page.drawRectangle({ x: margin, y: y - 60, width: contentW, height: 50, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("The market is not asking for a better EQ plugin. It is asking for a notary for the AI era.", { x: margin + 12, y: y - 32, size: 11, font: fb, color: dark });
      y -= 70;
      pageNumber(++pageIdx, 0);
    },
  });

  // 3. THE LAW
  pages.push({
    build: async () => {
      newPage();
      heading("What the Law Actually Says");
      body("The U.S. Copyright Office has repeatedly confirmed that copyright protection requires human authorship. In its March 2023 guidance and January 2025 Copyrightability Report, the Office stated:");
      y -= 8;
      page.drawRectangle({ x: margin, y: y - 120, width: contentW, height: 110, color: offWhite, borderColor: accent, borderWidth: 1 });
      const quote = "The Office will not register works produced by a machine or mere mechanical process that operates randomly or automatically without any creative input or intervention from a human author. Where a human's contribution is limited to selecting and arranging material, the resulting work may be registered only if the selection and arrangement are sufficiently creative.";
      drawText(quote, 10, dark, fi, margin + 12, contentW - 24, 16);
      y -= 12;
      page.drawText("— U.S. Copyright Office, Copyright and Artificial Intelligence: Part 2 (Jan. 2025)", { x: margin + 12, y, size: 9, font: fb, color: accent });
      y -= 28;
      body("The critical implication: music created with AI assistance is copyrightable if the human can prove meaningful creative contribution. The problem is not whether AI-assisted music is protected. The problem is proving the human's share.");
      y -= 10;
      body("GravelKing Pro solves the proof problem. Every edit, rewrite, and creative decision is logged, scored, and converted into a forensic record that can be submitted in a copyright dispute.");
      pageNumber(++pageIdx, 0);
    },
  });

  // 4. THE SOLUTION
  pages.push({
    build: async () => {
      newPage();
      heading("The Solution: MLK V3.5 Authorship Engine");
      body("The Morris Law Kernel V3.5 is a multi-stage audio processing and authorship measurement engine. It runs inside every creative workflow and compares the artist's final output against the original AI-generated or imported baseline.");
      y -= 12;
      subheading("How it works in plain language:");
      bullet([
        "Capture baseline: record the AI-generated draft, imported track, or starting point.",
        "Measure changes: every human edit, rewrite, arrangement, and mix decision is logged.",
        "Score contribution: the engine outputs a 0–100 human authorship score.",
        "Issue certificate: when the score crosses the legal threshold, a timestamped IP certificate is generated.",
      ]);
      y -= 16;
      page.drawRectangle({ x: margin, y: y - 50, width: contentW, height: 42, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("25% human contribution is the legal threshold we use for certificate issuance.", { x: margin + 12, y: y - 26, size: 11, font: fb, color: dark });
      y -= 58;
      pageNumber(++pageIdx, 0);
    },
  });

  // 5. IP RIGHTS — LYRICS WRITER
  pages.push({
    build: async () => {
      newPage();
      heading("IP Rights: The Lyrics Writer Tool");
      subheading("From AI draft to defensible human authorship");
      body("The Songwriting Studio is not a chatbot that writes lyrics for the artist. It is a forensic co-writing environment. The artist enters a concept, the AI generates a starting draft, and every human rewrite, deletion, and addition is tracked using diff-match-patch analysis.");
      y -= 12;
      bullet([
        "Line-by-line authorship scoring: the final lyric is compared to the AI baseline.",
        "Delete-and-retype produces zero credit — preventing gaming the system.",
        "The resulting score is recorded in the IP certificate as evidence of human contribution.",
        "Pro users can send the certified lyric directly to Suno or export it for registration.",
      ]);
      y -= 16;
      page.drawText("Legal benefit: the artist walks away with a timestamped, server-side record of exactly how much of the song they wrote — before they ever file a copyright application.", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 28;
      pageNumber(++pageIdx, 0);
    },
  });

  // 6. IP RIGHTS — CRYPTOGRAPHIC PROTECTION
  pages.push({
    build: async () => {
      newPage();
      heading("Tamper-Proof Without Giving Away the Vault");
      subheading("What we disclose publicly:");
      bullet([
        "Every mastered WAV carries a forensic mark embedded in the audio signal itself.",
        "The mark is invisible to the ear and survives normal format conversion.",
        "A separate verification record is stored on our server, dual-backed to a second location.",
        "When a file is verified, our server checks whether the audio fingerprint still matches the stored record.",
      ]);
      y -= 12;
      subheading("What we do NOT disclose (and why):");
      body("We describe the outcome — cryptographic verification, dual storage, fingerprint mismatch detection — without revealing the exact embedding technique, algorithmic parameters, or server-side verification protocol. The moat is not the math; it is the accumulated verification authority and the dual-backed record that only we can produce.");
      y -= 10;
      page.drawRectangle({ x: margin, y: y - 52, width: contentW, height: 44, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("Any modified, re-encoded, or altered file will fail verification. That is the only secret a customer needs to know.", { x: margin + 12, y: y - 28, size: 10, font: fb, color: dark });
      y -= 60;
      pageNumber(++pageIdx, 0);
    },
  });

  // 7. TOOL: Songwriting
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Songwriting Studio");
      subheading("AI co-writer with built-in authorship proof");
      await addImage("songwriting.jpg", 280);
      body("The artist describes a concept, mood, or lyric seed. The AI writes a starting draft. The artist then rewrites, edits, and personalizes the lyrics. The platform tracks exactly how much of the final song came from the human vs. the AI.");
      bullet([
        "8+ genre templates",
        "Line-by-line authorship scoring",
        "Direct export to IP certificate",
        "Suno integration for Pro users",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 8. TOOL: Mastering
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Mastering");
      subheading("Release-ready loudness with forensic certification");
      await addImage("mastering.jpg", 280);
      body("Upload a finished mix, pick a genre preset, and apply a full mastering chain — EQ, compression, loudness, optional denoise. The output is a broadcast-ready WAV that also carries the Clean Room forensic mark.");
      bullet([
        "MLK V3.5 normalization to 0.92 peak ceiling",
        "Genre-specific presets",
        "Before/after preview",
        "WAV download with embedded certificate linkage",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 9. TOOL: Vocal Booth
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Vocal Booth");
      subheading("Practice, record, and mix your vocal in the browser");
      await addImage("vocal-booth.jpg", 280);
      body("Load a backing track or split an existing song into instrumental + guide vocal. Follow a scrolling teleprompter, hear the guide melody on demand, record your take, and mix it down with the instrumental. The final mix contains only the instrumental and the artist's own recorded vocal.");
      bullet([
        "Browser-based recording",
        "Lyric highlighting (precise or energy-based fallback)",
        "Level monitoring and quality feedback",
        "Clean mixdown with no guide vocal leak",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 10. TOOL: Mix Studio
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Live DAW / Mix Studio");
      subheading("Full multi-track studio in one tab");
      await addImage("studio.jpg", 280);
      body("Import or record multiple tracks, set volume and pan, add per-track plugins (EQ, compression, reverb), and mix down to a finished stereo file. Everything runs client-side in the browser — no upload, no round-trip latency. Every creative action contributes to the authorship score.");
      bullet([
        "Synchronized timeline and waveform scrubbing",
        "Per-track plugins and automation",
        "Project save and resume",
        "MLK V3.5 on every export",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 11. TOOL: Beat Maker
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Beat Maker");
      subheading("AI-generated beats that feed the authorship pipeline");
      await addImage("beatmaker.jpg", 280);
      body("Describe the style, tempo, and feel of the beat. The platform generates a custom beat using ffmpeg lavfi synthesis and the MLK V3.5 kernel, then loads it directly into the mixing studio for further customization. Every customization counts toward authorship.");
      bullet([
        "30-second free generation",
        "Up to 120-second generation for Pro users",
        "MLK V3.5 multi-band carving applied",
        "One-click load into the DAW",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 12. TOOL: File Converter
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: File Converter");
      subheading("Any format, free, no third-party upload");
      await addImage("download.jpg", 280);
      body("Convert any audio or video to MP3, WAV, FLAC, M4A, or OGG. Audio is auto-extracted from video formats. The converter is free for everyone and processes files without sending them to a third-party service.");
      bullet([
        "Audio and video input support",
        "Multiple output formats",
        "Free tier included",
        "Privacy-first processing",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 13. TOOL: Label / IP Cert
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Label Hub & IP Certificates");
      subheading("The certificate is the product");
      await addImage("label.jpg", 280);
      body("Browse the GK Productions roster, review IP certificate status across the catalog, submit tracks, and verify certificates. The IP certificate is a tamper-proof, timestamped document tied to a specific track and session. It can be used to defend rights, attach to streaming profiles, or present in a legal dispute.");
      bullet([
        "Roster and artist pages",
        "Cert status dashboard",
        "Track submission workflow",
        "Verify-cert endpoint for third parties",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 14. TOOL: Kernel Dashboard
  pages.push({
    build: async () => {
      newPage();
      heading("Tool: Kernel Dashboard");
      subheading("Real-time MLK V3.5 telemetry");
      await addImage("kernel.jpg", 280);
      body("The Kernel Dashboard provides real-time MLK V3.5 processing telemetry, live before/after comparison, and authorship scoring. It is the command center for understanding how the engine is shaping the audio and measuring the human creative contribution.");
      bullet([
        "Live processing metrics",
        "Before/after waveform comparison",
        "Authorship score visualization",
        "Hardware optimization benchmark (Node Auditor)",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // 15. PRICING
  pages.push({
    build: async () => {
      newPage();
      heading("Pricing & Revenue Model");
      body("GravelKing Pro is built around three monetization layers: consumer subscriptions, enterprise catalog audits, and verification API calls.");
      y -= 12;
      const plans = [
        ["Starter", "Free", "Core tools, 1 free master, file converter"],
        ["Pro", "$9.99/mo", "Unlimited removal/splitting + preset masters"],
        ["King", "$24.99/mo", "Full studio + MLK V3.5 optimizer + 7-day trial"],
        ["Node Auditor", "$499/mo", "Unlimited optimization runs, API access, label hub"],
      ];
      for (const [name, price, desc] of plans) {
        page.drawRectangle({ x: margin, y: y - 52, width: contentW, height: 46, color: offWhite, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });
        page.drawText(name, { x: margin + 10, y: y - 22, size: 12, font: fb, color: dark });
        page.drawText(price, { x: margin + 10, y: y - 40, size: 11, font: fb, color: accent });
        page.drawText(desc, { x: margin + 140, y: y - 30, size: 9, font: f, color: gray });
        y -= 56;
      }
      y -= 10;
      body("Enterprise tiers include $499/mo, $2,499/mo, and annual chain-of-title licenses starting at $25K/year. Verification API calls are priced at $0.10 per call.");
      pageNumber(++pageIdx, 0);
    },
  });

  // 16. TRACTION
  pages.push({
    build: async () => {
      newPage();
      heading("Current Traction (Live Data)");
      body("GravelKing Pro is live, processing audio, and accepting payments. As of today, the platform has:");
      y -= 12;
      const stats = [
        ["58", "total users"],
        ["30", "unique visitors today"],
        ["62", "pageviews today"],
        ["18", "Pro-tier users"],
        ["0", "paid subscriptions active"],
      ];
      let colX = margin;
      for (const [value, label] of stats) {
        page.drawText(value, { x: colX, y, size: 28, font: fb, color: accent });
        page.drawText(label, { x: colX, y: y - 18, size: 9, font: fb, color: gray });
        colX += 105;
      }
      y -= 40;
      y -= 12;
      body("The numbers are honest: we have product-market fit signals but the paid conversion funnel has been blocked by two recent production bugs that are now fixed and pending the next publish. The next 30 days are about converting visitors into paying subscribers.");
      y -= 10;
      page.drawRectangle({ x: margin, y: y - 50, width: contentW, height: 42, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("Every new paid subscriber increases the value of the verification network. That is the compounding moat.", { x: margin + 12, y: y - 27, size: 10, font: fb, color: dark });
      y -= 56;
      pageNumber(++pageIdx, 0);
    },
  });

  // 17. FINANCIAL PROJECTIONS
  pages.push({
    build: async () => {
      newPage();
      heading("Financial Projections: No-Fluff Numbers");
      body("Assumptions: 30 unique visitors/day currently, 2–4% free-to-paid conversion, average revenue per paying user of $25/mo, and first enterprise verification pilot in month 4.");
      y -= 12;
      subheading("6-Month Projection");
      bullet([
        "Month 1–2: fix conversion funnel, target 100 paying subscribers = $2,500 MRR",
        "Month 3–4: launch affiliate/promo push, target 500 paying subscribers = $12,500 MRR",
        "Month 5–6: first enterprise pilot ($2,499/mo) + API usage = $20,000 MRR",
        "6-month ARR: $240,000",
      ]);
      y -= 12;
      subheading("12-Month Projection");
      bullet([
        "Month 7–9: 1,000 paying subscribers + 2 enterprise clients = $35,000 MRR",
        "Month 10–12: distributor verification API volume grows = $50,000 MRR",
        "12-month ARR: $600,000",
      ]);
      y -= 12;
      page.drawRectangle({ x: margin, y: y - 60, width: contentW, height: 52, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("These are execution-dependent projections. The base case assumes only the existing web traffic and zero paid marketing spend. A seed investment accelerates them.", { x: margin + 12, y: y - 30, size: 10, font: fb, color: dark });
      y -= 68;
      pageNumber(++pageIdx, 0);
    },
  });

  // 18. INVESTMENT RETURNS
  pages.push({
    build: async () => {
      newPage();
      heading("What an Investment Returns");
      subheading("We are raising a $250K–$500K seed bridge");
      body("Use of funds: conversion funnel optimization, paid acquisition tests, enterprise sales development, and verification API infrastructure scaling.");
      y -= 12;
      const returns = [
        ["$25K", "3-month paid acquisition test; expected 100+ paying subscribers"],
        ["$50K", "6-month enterprise sales development; target 2 pilot contracts"],
        ["$100K", "12-month runway extension; hit $30K MRR"],
        ["$250K", "Full seed bridge; reach $50K MRR and 1 enterprise license"],
      ];
      for (const [amount, desc] of returns) {
        page.drawText(amount, { x: margin, y, size: 13, font: fb, color: accent });
        y -= 18;
        page.drawText(desc, { x: margin + 14, y, size: 10, font: f, color: gray });
        y -= 20;
      }
      y -= 12;
      body("Target investor return: 10–20x in 3–5 years based on a $5M–$15M Series A valuation at $1M–$3M ARR. The exit pathway is acquisition by a distributor, music rights platform, or AI infrastructure company.");
      pageNumber(++pageIdx, 0);
    },
  });

  // 19. WHY PIONEERS / WHY INVEST
  pages.push({
    build: async () => {
      newPage();
      heading("Why We Are the Pioneers");
      body("No other music platform has a live, dual-backed, cryptographic verification system for AI-assisted music. Every competitor solves a creative problem. We solve a legal problem — and that makes us stickier.");
      y -= 12;
      bullet([
        "First-mover in AI-assisted music chain-of-title verification.",
        "Live product with real users, payments, and audio processing.",
        "Proprietary MLK V3.5 engine with server-side verification authority.",
        "Built-in IP certificates create a network effect: more tracks = more value.",
        "Enterprise API ready for distributor and label integrations.",
      ]);
      y -= 16;
      subheading("Why invest now:");
      body("The legal framework is already in place. The Copyright Office has drawn the line. The only missing piece is a platform that gives artists proof. We built it. The next 12 months are about scaling the network before competitors can replicate the authority.");
      pageNumber(++pageIdx, 0);
    },
  });

  // 20. CLOSING / ASK
  pages.push({
    dark: true,
    build: async () => {
      newPage(dark);
      page.drawText("The Ask", { x: margin, y: pageH - 160, size: 30, font: fb, color: accent });
      page.drawText("$250K–$500K seed bridge", { x: margin, y: pageH - 210, size: 20, font: fb, color: white });
      body("To convert GravelKing Pro from a working product into a scaling revenue engine. Funds go to funnel optimization, paid acquisition, enterprise sales, and verification API scaling.");
      y -= 20;
      page.drawText("The music industry has a rights crisis.", { x: margin, y: pageH - 340, size: 14, font: fb, color: white });
      page.drawText("We have the solution.", { x: margin, y: pageH - 370, size: 14, font: fb, color: accent });
      page.drawText("gravelkingpro.com · All N One LLC · Kevin Morris, Chief Architect", { x: margin, y: 60, size: 10, font: f, color: lightGray });
      footer(true);
    },
  });

  const total = pages.length;
  pageIdx = 0;
  for (const p of pages) {
    await p.build();
    if (!p.dark) pageNumber(pageIdx, total);
    pageIdx++;
  }

  const outPath = path.join(outDir, "GravelKingPro_DetailedPitchDeck.pdf");
  fs.writeFileSync(outPath, await pdf.save());
  console.log(`Detailed pitch deck generated: ${outPath} (${(await pdf.save()).length} bytes)`);
}

createDetailedPitchDeck().catch((err) => {
  console.error(err);
  process.exit(1);
});
