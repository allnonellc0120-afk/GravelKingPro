import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

const accent = rgb(0.788, 0.635, 0.153);
const dark = rgb(0.031, 0.031, 0.031);
const white = rgb(1, 1, 1);
const gray = rgb(0.267, 0.267, 0.267);
const lightGray = rgb(0.6, 0.6, 0.6);

const pageW = 595; // A4 width
const pageH = 842; // A4 height
const margin = 48;
const contentW = pageW - margin * 2;

async function createAdminStrategyPDF() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page: ReturnType<typeof pdf.addPage>;
  let y: number;

  function newPage(bg = white) {
    page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bg });
    y = pageH - margin;
    return page;
  }

  function text(t: string, size: number, color = gray, fontFace = font, lineHeight?: number) {
    const lh = lineHeight ?? size * 1.4;
    const words = t.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (fontFace.widthOfTextAtSize(test, size) > contentW) {
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
    text(h, 24, color, bold, 30);
    y -= 8;
  }

  function bodyCopy(t: string) {
    text(t, 12, gray, font, 18);
  }

  newPage(dark);
  page.drawText("GRAVELKING PRO", { x: margin, y: pageH - 180, size: 36, font: bold, color: white });
  page.drawText("Admin Strategy Brief", { x: margin, y: pageH - 230, size: 22, font: bold, color: accent });
  page.drawText("Confidential · Internal Use Only", { x: margin, y: 80, size: 11, font, color: lightGray });
  y = 0;

  newPage();
  heading("Executive Thesis", dark);
  bodyCopy("The MLK V3.5 engine is not a feature. It is credentialing infrastructure — the same category as a credit bureau, title insurer, or certification body.");
  bodyCopy("Every mastered track leaves our servers with a cryptographic Clean Room certificate split between the audio file (LSB nominator) and our server (denominator + HMAC). Neither half validates alone.");
  bodyCopy("This creates a verification monopoly. Only GravelKing Pro can authenticate a GKP master. That is the enterprise business model, not the SaaS subscription.");

  newPage();
  heading("Three Revenue Pillars", dark);
  const pillars = [
    ["01 — Volume", "Automated mastering fees via Pro subscriptions. Gateway drug to certification."],
    ["02 — Margin", "Enterprise catalog audit tiers. Labels and distributors verifying AI-assisted catalogs at scale. $499/mo base, custom above 5,000 tracks/mo."],
    ["03 — Network", "Verification API call volumes. Third-party platforms, DSPs, and attorneys ping our endpoint for chain-of-title."],
  ];
  for (const [title, desc] of pillars) {
    page.drawText(title, { x: margin, y, size: 13, font: bold, color: accent });
    y -= 18;
    page.drawText(desc, { x: margin, y, size: 11, font, color: gray });
    y -= 24;
  }

  newPage();
  heading("Enterprise Tiers", dark);
  const tiers = [
    "Free — Core tools, limited runs",
    "Pro — $9.99/mo — Active indie artists, ~$180 LTV",
    "Enterprise Starter — $499/mo — Small labels, 500 track audits/mo, ~$12K LTV",
    "Enterprise Pro — $2,499/mo — Mid-size labels, 5,000 audits/mo, ~$60K LTV",
    "Chain-of-Title License — $25K–$100K/yr — White-label verification",
    "Verify API — $0.10/call — Attorneys, platforms, A&Rs",
  ];
  for (const t of tiers) {
    page.drawText("•", { x: margin, y, size: 11, font: bold, color: accent });
    page.drawText(t, { x: margin + 14, y, size: 11, font, color: dark });
    y -= 18;
  }

  newPage();
  heading("Go-to-Market: Distributors", dark);
  bodyCopy("Primary target: mid-tier independent distributors (50K–500K artists). Their legal teams are actively worried about AI-assisted liability.");
  bodyCopy("Integration: POST /api/kernel/verify-cert returns a JSON chain-of-custody record in under 2 seconds.");
  bodyCopy("Secondary: sync licensing agencies. Chain-of-title is contractually mandatory.");
  bodyCopy("Tertiary: publishing administrators.");

  newPage();
  heading("90-Day Priorities", dark);
  const priorities = [
    "Close first distributor capacity-license pilot",
    "Ship public Verify API documentation",
    "Stabilize subscription funnel (sign-in + checkout + mastering 500 fixes)",
    "Certify 100+ public tracks to seed the verification network",
    "Label Hub: artist roster, cert status, bulk export",
  ];
  for (const p of priorities) {
    page.drawText("•", { x: margin, y, size: 11, font: bold, color: accent });
    page.drawText(p, { x: margin + 14, y, size: 11, font, color: dark });
    y -= 18;
  }
  y -= 12;
  page.drawText("All N One LLC · Internal Use Only", { x: margin, y, size: 10, font: italic, color: gray });

  const count = pdf.getPageCount();
  for (let i = 0; i < count; i++) {
    const p = pdf.getPage(i);
    const isDark = i === 0;
    p.drawText("GravelKing Pro — Admin Strategy", { x: margin, y: 20, size: 9, font, color: isDark ? lightGray : gray });
    p.drawText(`${i + 1} / ${count}`, { x: pageW - margin - 30, y: 20, size: 9, font, color: isDark ? lightGray : gray });
  }

  const outPath = path.resolve(import.meta.dirname, "../../artifacts/gravelkingpro/public/GravelKingPro_AdminStrategy.pdf");
  fs.writeFileSync(outPath, await pdf.save());
  console.log(`Admin strategy PDF generated: ${outPath}`);
}

createAdminStrategyPDF().catch((err) => {
  console.error(err);
  process.exit(1);
});
