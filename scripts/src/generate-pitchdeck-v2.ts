import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import fs from "fs";

const accent = rgb(0.788, 0.635, 0.153); // #c9a227
const dark = rgb(0.031, 0.031, 0.031);   // #080808
const white = rgb(1, 1, 1);
const gray = rgb(0.267, 0.267, 0.267);  // #444
const lightGray = rgb(0.6, 0.6, 0.6);

const pageW = PageSizes.A4[0];
const pageH = PageSizes.A4[1];
const margin = 48;
const contentW = pageW - margin * 2;

async function createPitchDeckV2() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let y = pageH - margin;
  // Definite assignment: newPage() is always called before any use of `page`.
  let page!: ReturnType<typeof pdf.addPage>;

  function newPage(bg = dark) {
    page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bg });
    y = pageH - margin;
    return page;
  }

  function text(text: string, size: number, color = white, fontFace = font, lineHeight?: number) {
    const lh = lineHeight ?? size * 1.4;
    const words = text.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (bold.widthOfTextAtSize(test, size) > contentW) {
        if (line) {
          page.drawText(line, { x: margin, y, size, font: fontFace, color });
          y -= lh;
          line = w;
        } else {
          page.drawText(w, { x: margin, y, size, font: fontFace, color });
          y -= lh;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size, font: fontFace, color });
      y -= lh;
    }
  }

  function heading(h: string, color = accent) {
    text(h, 28, color, bold, 34);
    y -= 8;
  }

  function subheading(h: string) {
    text(h, 16, lightGray, bold, 22);
    y -= 4;
  }

  function bodyCopy(t: string, color = gray) {
    text(t, 14, color, font, 22);
  }

  function stat(label: string, value: string, x: number, w: number) {
    page.drawText(value, { x, y: y, size: 24, font: bold, color: accent });
    page.drawText(label, { x, y: y - 20, size: 9, font: bold, color: lightGray });
  }

  // COVER
  newPage();
  page.drawText("GRAVELKING PRO", { x: margin, y: pageH - 200, size: 44, font: bold, color: white });
  page.drawText("The Pitch", { x: margin, y: pageH - 250, size: 30, font: bold, color: accent });
  page.drawText("The only music studio that proves you made it.", { x: margin, y: pageH - 300, size: 16, font: font, color: white });
  page.drawText("gravelkingpro.com", { x: margin, y: 80, size: 12, font: bold, color: accent });
  y = 0;

  // PROBLEM
  newPage(white);
  heading("The Problem", dark);
  bodyCopy("200 million AI-generated tracks were uploaded to streaming platforms in 2024. The U.S. Copyright Office denied protection to all of them.");
  bodyCopy("But the ruling contains one critical fact: music that a human meaningfully edited, mixed, or arranged qualifies for copyright protection — if they can prove it.");
  bodyCopy("Today, every artist needs a studio that captures proof while they create, not a notary after the fact.");

  // SOLUTION
  newPage(white);
  heading("The Solution", dark);
  subheading("MLK V3.5 + Clean Room Protocol");
  bodyCopy("GravelKing Pro is a complete browser studio — write, record, mix, master, and certify — in one tab.");
  bodyCopy("Every creative action is measured against the original baseline by the Morris Law Kernel V3.5 authorship engine. When human contribution crosses the legal threshold, a tamper-proof IP certificate is issued.");
  bodyCopy("Every mastered WAV also carries a cryptographic nominator embedded in the PCM signal. The matching denominator and HMAC live on our server. Alter the file, and the handshake fails.");

  // PRODUCT
  newPage(white);
  heading("The Product", dark);
  bodyCopy("Four pillars. One workflow.");
  y -= 12;
  const tools = [
    ["IP Certification", "Track every human edit and generate a legal proof-of-ownership document."],
    ["Mastering", "Upload a mix, pick a genre preset, and export a broadcast-ready mastered WAV."],
    ["Vocal Booth", "Sing over any instrumental with a scrolling teleprompter, then record and mix."],
    ["Live DAW", "Full multi-track mixing studio with plugins, timeline, and export — all in the browser."],
  ];
  for (const [name, desc] of tools) {
    page.drawText("•", { x: margin, y, size: 14, font: bold, color: accent });
    page.drawText(name, { x: margin + 14, y, size: 14, font: bold, color: dark });
    y -= 18;
    page.drawText(desc, { x: margin + 14, y, size: 12, font: font, color: gray });
    y -= 26;
  }

  // MOAT
  newPage(white);
  heading("The Moat", dark);
  subheading("Why nobody can copy this overnight");
  bodyCopy("The IP certificate is not a feature — it is infrastructure. The verification authority is the accumulated server-side record, not an algorithm.");
  bodyCopy("Competitors can build a DAW or a mastering tool. They cannot replicate a subpoenable, dual-backed cryptographic chain-of-custody without years of certified catalog growth.");
  bodyCopy("That makes GravelKing Pro the verification authority for AI-assisted music. Labels, distributors, and attorneys will need our API to prove chain-of-title.");

  // PRICING
  newPage(white);
  heading("Pricing", dark);
  const plans = [
    ["Starter", "Free", "Core tools, limited runs"],
    ["Weekly", "$9.99/week", "Unlimited removal, splitting & preset masters"],
    ["Pro Plus", "$24.99/mo", "Studio tools + MLK V3.5 optimizer + 7-day trial"],
    ["Node Auditor", "$499/mo", "Enterprise optimization, API access, label hub"],
  ];
  for (const [name, price, desc] of plans) {
    page.drawRectangle({ x: margin, y: y - 58, width: contentW, height: 54, color: rgb(0.98, 0.98, 0.98), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });
    page.drawText(name, { x: margin + 12, y: y - 22, size: 14, font: bold, color: dark });
    page.drawText(price, { x: margin + 12, y: y - 42, size: 12, font: bold, color: accent });
    page.drawText(desc, { x: margin + 180, y: y - 30, size: 11, font: font, color: gray });
    y -= 66;
  }
  y -= 12;
  page.drawText("30-day money-back guarantee. No questions asked.", { x: margin, y, size: 11, font: italic, color: gray });

  // ASK
  newPage(white);
  heading("The Ask", dark);
  bodyCopy("GravelKing Pro is live. Payments are processing. The verification engine is running. The first enterprise API conversations can start now.");
  bodyCopy("We are raising capital to scale the enterprise verification pipeline: distributor integrations, label audit tiers, and chain-of-title API capacity.");
  bodyCopy("The music industry has a rights crisis. We have the solution.");
  y -= 30;
  page.drawText("gravelkingpro.com", { x: margin, y, size: 14, font: bold, color: accent });
  page.drawText("All N One LLC · Kevin Morris, Chief Architect", { x: margin, y: y - 22, size: 11, font: font, color: gray });

  // Footer on all pages
  const count = pdf.getPageCount();
  for (let i = 0; i < count; i++) {
    const p = pdf.getPage(i);
    const isDark = i === 0;
    p.drawText("GravelKing Pro · All N One LLC", { x: margin, y: 20, size: 9, font, color: isDark ? lightGray : gray });
    p.drawText(`${i + 1} / ${count}`, { x: pageW - margin - 30, y: 20, size: 9, font, color: isDark ? lightGray : gray });
  }

  const bytes = await pdf.save();
  const outPath = "artifacts/gravelkingpro/public/GravelKingPro_PitchDeck.pdf";
  fs.writeFileSync(outPath, bytes);
  console.log(`Pitch deck generated: ${outPath} (${bytes.length} bytes)`);
}

createPitchDeckV2().catch((err) => {
  console.error(err);
  process.exit(1);
});
