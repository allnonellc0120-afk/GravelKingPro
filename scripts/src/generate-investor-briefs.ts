import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";

const accent = rgb(0.96, 0.62, 0.04); // amber
const teal = rgb(0.37, 0.92, 0.83);
const dark = rgb(0.027, 0.067, 0.122);
const white = rgb(1, 1, 1);
const gray = rgb(0.25, 0.25, 0.28);
const lightGray = rgb(0.55, 0.55, 0.58);
const red = rgb(0.8, 0.15, 0.15);

const pageW = 595;
const pageH = 842;
const margin = 48;
const contentW = pageW - margin * 2;

interface Ctx {
  pdf: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  page: PDFPage;
  y: number;
}

async function newDoc(): Promise<Ctx> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  return { pdf, font, bold, italic, page: null as unknown as PDFPage, y: 0 };
}

function newPage(ctx: Ctx, bg = white) {
  ctx.page = ctx.pdf.addPage([pageW, pageH]);
  ctx.page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bg });
  ctx.y = pageH - margin;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < margin + 30) newPage(ctx);
}

function wrapText(ctx: Ctx, t: string, size: number, fontFace: PDFFont, width = contentW): string[] {
  const words = t.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (fontFace.widthOfTextAtSize(test, size) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function text(ctx: Ctx, t: string, size: number, color = gray, fontFace?: PDFFont, x = margin, width = contentW) {
  const f = fontFace ?? ctx.font;
  const lh = size * 1.45;
  const lines = wrapText(ctx, t, size, f, width);
  ensureSpace(ctx, lines.length * lh);
  for (const line of lines) {
    ctx.page.drawText(line, { x, y: ctx.y, size, font: f, color });
    ctx.y -= lh;
  }
}

function heading(ctx: Ctx, h: string, color = dark) {
  ensureSpace(ctx, 60);
  ctx.y -= 6;
  text(ctx, h, 19, color, ctx.bold);
  ctx.y -= 4;
}

function sub(ctx: Ctx, h: string, color = accent) {
  ensureSpace(ctx, 40);
  ctx.y -= 2;
  text(ctx, h, 13, color, ctx.bold);
}

function body(ctx: Ctx, t: string) {
  text(ctx, t, 10.5, gray);
  ctx.y -= 3;
}

function bullet(ctx: Ctx, t: string, indent = 0) {
  const f = ctx.font;
  const size = 10.5;
  const lh = size * 1.45;
  const x = margin + 14 + indent;
  const w = contentW - 14 - indent;
  const lines = wrapText(ctx, t, size, f, w);
  ensureSpace(ctx, lines.length * lh + 2);
  ctx.page.drawText("\u2022", { x: margin + indent, y: ctx.y, size, font: ctx.bold, color: accent });
  for (const line of lines) {
    ctx.page.drawText(line, { x, y: ctx.y, size, font: f, color: gray });
    ctx.y -= lh;
  }
  ctx.y -= 2;
}

function divider(ctx: Ctx) {
  ensureSpace(ctx, 20);
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x: margin, y: ctx.y },
    end: { x: pageW - margin, y: ctx.y },
    thickness: 0.5,
    color: lightGray,
  });
  ctx.y -= 14;
}

function coverPage(ctx: Ctx, title: string, subtitle: string, warning: string) {
  newPage(ctx, dark);
  ctx.page.drawText("GRAVELKING PRO", { x: margin, y: pageH - 160, size: 30, font: ctx.bold, color: white });
  ctx.page.drawText(title, { x: margin, y: pageH - 205, size: 19, font: ctx.bold, color: accent });
  const subLines = wrapText(ctx, subtitle, 12, ctx.font);
  let sy = pageH - 240;
  for (const l of subLines) {
    ctx.page.drawText(l, { x: margin, y: sy, size: 12, font: ctx.font, color: rgb(0.8, 0.8, 0.82) });
    sy -= 17;
  }
  // warning box
  ctx.page.drawRectangle({ x: margin, y: 90, width: contentW, height: 70, color: rgb(0.15, 0.05, 0.05), borderColor: red, borderWidth: 1.5 });
  ctx.page.drawText("PRIVATE - FOUNDER'S EYES ONLY", { x: margin + 16, y: 132, size: 13, font: ctx.bold, color: rgb(1, 0.45, 0.45) });
  const wLines = wrapText(ctx, warning, 9.5, ctx.font, contentW - 32);
  let wy = 114;
  for (const l of wLines) {
    ctx.page.drawText(l, { x: margin + 16, y: wy, size: 9.5, font: ctx.font, color: rgb(0.9, 0.75, 0.75) });
    wy -= 13;
  }
  ctx.page.drawText("Prepared August 15, 2026", { x: margin, y: 60, size: 10, font: ctx.italic, color: lightGray });
}

function footerAll(ctx: Ctx, label: string) {
  const count = ctx.pdf.getPageCount();
  for (let i = 0; i < count; i++) {
    const p = ctx.pdf.getPage(i);
    const isDark = i === 0;
    p.drawText(label, { x: margin, y: 20, size: 8.5, font: ctx.font, color: isDark ? lightGray : lightGray });
    p.drawText(`${i + 1} / ${count}`, { x: pageW - margin - 30, y: 20, size: 8.5, font: ctx.font, color: lightGray });
  }
}

// ---------------------------------------------------------------------------
// PDF 1 — Buyout & Valuation Brief
// ---------------------------------------------------------------------------
async function buildValuationBrief(outDir: string) {
  const ctx = await newDoc();
  coverPage(
    ctx,
    "Buyout & Valuation Brief",
    "Asset-based valuation, asking prices, deal structures, and negotiation floors for GravelKing Pro / All N One LLC.",
    "Do not attach, forward, or screenshot this document. Figures are founder estimates for negotiation planning - not an independent appraisal. Share only the public promo deck externally."
  );

  newPage(ctx);
  heading(ctx, "1. What Is Being Valued");
  body(ctx, "GravelKing Pro is a live, revenue-wired music platform: AI-attributed IP certification (split-key certificates), proprietary Morris Law Kernel v3.5 multi-band mastering DSP, browser Vocal Booth and karaoke DAW, generative music pipeline, Stripe + Google Play billing, Android TWA on the Play Store, and a production deployment at gravelkingpro.it.com. Built and shipped bootstrapped by a solo founder.");
  divider(ctx);

  heading(ctx, "2. Asset-Based Valuation (Replacement Cost)");
  const rows: [string, string, string][] = [
    ["Morris Law Kernel v3.5 (proprietary DSP)", "$800K - $1.2M", "Years of multi-band mastering R&D; no open-source equivalent; runs every track on the platform."],
    ["Split-key cert + provenance architecture", "$200K - $500K", "Nominator in audio LSBs, denominator + HMAC server-side; AI attribution + catalog screening on every cert."],
    ["Generative pipeline + AI integrations", "$150K - $400K", "Lyria 3 generation, Gemini pre-pass safety, authorship scoring, karaoke sync."],
    ["Registry data + customer base", "$50K - $200K", "Growing certified-track registry; compounds as a data asset no acquirer can rebuild retroactively."],
    ["Brand, domain, store presence", "$20K - $80K", "gravelkingpro.it.com, Play Store listing, referral program."],
  ];
  for (const [name, range, note] of rows) {
    ensureSpace(ctx, 50);
    ctx.page.drawText(name, { x: margin, y: ctx.y, size: 10.5, font: ctx.bold, color: dark });
    const rw = ctx.bold.widthOfTextAtSize(range, 10.5);
    ctx.page.drawText(range, { x: pageW - margin - rw, y: ctx.y, size: 10.5, font: ctx.bold, color: rgb(0.05, 0.5, 0.45) });
    ctx.y -= 15;
    text(ctx, note, 9.5, lightGray);
    ctx.y -= 4;
  }
  ensureSpace(ctx, 30);
  ctx.page.drawRectangle({ x: margin, y: ctx.y - 24, width: contentW, height: 34, color: rgb(0.99, 0.95, 0.85), borderColor: accent, borderWidth: 1 });
  ctx.page.drawText("ESTIMATED TOTAL: $1.2M - $2.4M", { x: margin + 12, y: ctx.y - 12, size: 13, font: ctx.bold, color: dark });
  ctx.y -= 44;
  body(ctx, "Caveat: pre-revenue-scale figures stated as ranges on purpose. Anchor high, justify with replacement cost, concede slowly.");
  divider(ctx);

  heading(ctx, "3. Asking Prices by Deal Type");
  sub(ctx, "A. Seed investment (preferred path)");
  bullet(ctx, "Ask: $250K for 15% - implied $1.67M pre-money, inside the asset range.");
  bullet(ctx, "Floor: $250K for 20% ($1.0M pre-money). Below that, walk - the DSP alone justifies more.");
  bullet(ctx, "Use of funds framing: 40% engineering (MLK v4, mobile, registry scale), 30% growth, 20% legal/IP filings, 10% ops.");
  sub(ctx, "B. Full buyout / acquisition");
  bullet(ctx, "Open at $2.4M (top of asset range). Target close: $1.8M - $2.2M cash or cash+earnout.");
  bullet(ctx, "Walk-away floor: $1.2M all-cash. Below that, keep operating - the registry compounds in your favor.");
  bullet(ctx, "Earnout structure to accept: up to 30% of price tied to 12-month integration milestones, never longer.");
  bullet(ctx, "Comparable signal: Warner Music acquired AI-attribution startup Sureel (June 2026, terms undisclosed) - majors are buying this category. Cite the category, not a number.");
  sub(ctx, "C. Technology licensing (no equity)");
  bullet(ctx, "White-label MLK mastering + certification API: $500 - $5,000/mo per seat depending on volume.");
  bullet(ctx, "Enterprise catalog audit: $499/mo base (small labels) to $2,499/mo (5,000 audits/mo).");
  bullet(ctx, "Exclusive category license (e.g. one distributor vertical): $100K - $250K/yr, 2-year minimum, non-exclusive after year 2.");
  bullet(ctx, "Verify API: $0.10/call for attorneys, platforms, A&Rs.");
  sub(ctx, "D. Acqui-hire (resist this framing)");
  bullet(ctx, "If pushed toward acqui-hire pricing, reframe to asset sale: the kernel + cert registry transfer, founder consults 6 months max. Floor $800K.");
  divider(ctx);

  heading(ctx, "4. Negotiation Techniques");
  bullet(ctx, "Never open with a number in the first meeting. Demo first: master a track live, show the cert verification link resolving publicly.");
  bullet(ctx, "Anchor on replacement cost ('what would it cost you to build this and wait two years?'), not on current MRR.");
  bullet(ctx, "Create optionality pressure: every conversation should know (without specifics) that license, seed, and buyout tracks all exist.");
  bullet(ctx, "The registry is the clock: every certified track makes a rebuild less viable. Say it once per negotiation, no more.");
  bullet(ctx, "Concede structure before price: earnouts, consulting tails, and exclusivity windows are cheaper to give than dollars.");
  bullet(ctx, "Get any serious buyer under NDA before revealing kernel internals, cert cryptography, or unit economics.");
  bullet(ctx, "Never send this document or the outreach playbook. External parties get the public promo deck only.");

  footerAll(ctx, "GravelKing Pro - Buyout & Valuation Brief - PRIVATE");
  const out = path.join(outDir, "GravelKingPro_Buyout_Valuation_Brief_PRIVATE.pdf");
  fs.writeFileSync(out, await ctx.pdf.save());
  console.log("WROTE:" + out);
}

// ---------------------------------------------------------------------------
// PDF 2 — Investor Outreach Playbook + 30-Day Road to 100
// ---------------------------------------------------------------------------
interface Prospect {
  name: string;
  why: string;
  route: string;
  angle: string;
  message: string;
}

async function buildOutreachPlaybook(outDir: string) {
  const ctx = await newDoc();
  coverPage(
    ctx,
    "Investor Outreach Playbook + 30-Day Road to 100",
    "Qualified prospects, contact routes, per-target pain-point angles, draft DM copy, and the 30-day bootstrap plan to 100 subscribers, investors, or license deals.",
    "Contains outreach strategy and draft private messages. Do not post publicly or forward. These are qualified prospects - no meeting or investment is promised. Verify every contact route on the target's official site before sending."
  );

  newPage(ctx);
  heading(ctx, "How To Use This Playbook");
  bullet(ctx, "Only ONE verified public email exists in this list: contact@sbg.vc. Every other route is the target's official website form or LinkedIn - never guess an email address.");
  bullet(ctx, "Cadence per target: Touch 1 (DM/form, tailored message below), Touch 2 at day 5 (one new proof point, e.g. a fresh certified track), Touch 3 at day 12 (short close: 'happy to do 15 minutes or leave it here'). Then stop.");
  bullet(ctx, "Always attach or link ONLY the public promo deck and the live site. The valuation brief and this playbook never leave your hands.");
  bullet(ctx, "Lead every message with the live product, not the idea: the Play Store listing and a working cert verification link beat any pitch paragraph.");
  bullet(ctx, "These are qualified prospects based on thesis fit - treat every claim about their recent raises or funds as unverified until you confirm it on their own site.");
  divider(ctx);

  const prospects: Prospect[] = [
    {
      name: "1. Mindset Ventures (MusicTech thesis)",
      why: "Cross-border VC with an explicit music-tech / creator-tools investment thesis.",
      route: "Official site contact form + LinkedIn partner outreach. No public email verified.",
      angle: "They look for infrastructure plays, not another streaming app. Pitch certification-as-infrastructure: the credit bureau of AI-era music.",
      message: "Hi - I built GravelKing Pro, a live platform that masters, certifies, and AI-attributes music. Every track gets a split-key certificate with the AI model named and a catalog screen result. It's live on web + Google Play, billing wired, bootstrapped solo. Given your music-tech infrastructure thesis, I'd value 15 minutes: [public deck link] + live demo at gravelkingpro.it.com.",
    },
    {
      name: "2. Decile Access / Joker Deck Ventures",
      why: "Early-stage network writing micro-checks into pre-seed products already in market.",
      route: "Decile Group network application on official site; LinkedIn for the Joker Deck GP.",
      angle: "They favor shipped products with founders who don't need permission. Lead with 'live in production, bootstrapped to billing' - that IS their filter.",
      message: "Hi - solo founder, shipped product: GravelKing Pro certifies who made a song (human vs AI, catalog-screened) and masters it with proprietary DSP. Live on web and Play Store with Stripe + Play Billing wired. Pre-seed opening now. Public deck: [link]. Live: gravelkingpro.it.com.",
    },
    {
      name: "3. Amplify Music Ventures / Amplify.LA",
      why: "LA accelerator/fund with a music-tech portfolio and hands-on GTM support.",
      route: "Application form on official site; warm intros via their portfolio founders on LinkedIn.",
      angle: "They add distribution muscle. Pitch the wedge: free cert stamping grows the registry, the $1.99 document and $9.99 Studio convert - they can pour fuel on a working funnel.",
      message: "Hi Amplify team - GravelKing Pro is a live music platform where creators master, record, and get AI-attribution certificates ($1.99/doc, $9.99/mo Studio). Free stamping seeds a provenance registry that compounds. I want a partner who knows music GTM. Deck: [link], live at gravelkingpro.it.com.",
    },
    {
      name: "4. Jukebox",
      why: "Music investment platform - fans and investors buying into music royalties and assets.",
      route: "Official site contact/partnerships page.",
      angle: "Their whole model depends on clean chain-of-title. Pitch certification as the diligence layer for every asset they list: partnership first, investment second.",
      message: "Hi - royalty investing only works when provenance is clean. GravelKing Pro issues split-key certificates recording who made each track (human vs AI) plus a commercial-catalog screen. Could be a diligence layer for assets on Jukebox. 15 minutes to explore a partnership or more? gravelkingpro.it.com.",
    },
    {
      name: "5. Yamaha Music Innovations",
      why: "Corporate VC arm of a music hardware/software giant; strategic acquirer profile.",
      route: "Official innovation program / partnership form on Yamaha's corporate site. Long cycle - start now.",
      angle: "Strategic, not financial: MLK mastering could live inside their creator tools, and certification differentiates their AI features. This is a licensing or buyout track.",
      message: "Hello - I've built a proprietary multi-band mastering kernel (MLK v3.5) plus an AI-attribution certification system, live in production. For Yamaha's creator ecosystem this could be a white-label mastering + provenance layer. Open to licensing or deeper conversations. Public overview: [link].",
    },
    {
      name: "6. Backbeat Capital",
      why: "Pre-seed fund investing specifically in music-tech infrastructure.",
      route: "Official site pitch form; LinkedIn GP outreach.",
      angle: "Exact stage + sector match. Don't oversell - state stage, traction wiring, and the ask window plainly. They see hundreds of decks; live product is the differentiator.",
      message: "Hi Backbeat - pre-seed music-tech: GravelKing Pro, live AI-attribution certification + proprietary mastering, web + Play Store, billing wired, solo founder, bootstrapped. Opening a seed conversation this quarter. Deck: [link]. Live: gravelkingpro.it.com.",
    },
    {
      name: "7. Creator Ventures",
      why: "Creator-economy fund backing tools that help creators earn.",
      route: "Official site; LinkedIn to the founding partners.",
      angle: "Frame the creator's earning problem: unattributed tracks can't be licensed, synced, or defended. A $1.99 certificate makes a bedroom track a licensable asset.",
      message: "Hi - creators can't monetize what they can't prove they made. GravelKing Pro turns any track into a certified, AI-attributed, catalog-screened asset for $1.99, with mastering and recording built in. Live product, real billing. Deck: [link] - keen to show you the 90-second flow.",
    },
    {
      name: "8. Triptyq Capital",
      why: "Creative-industries tech fund (Quebec) backing tools for creative production.",
      route: "Pitch form on official site.",
      angle: "They fund the picks-and-shovels of creative production. Position the browser studio (DAW + Vocal Booth + mastering) as production infrastructure with provenance as the moat.",
      message: "Hello Triptyq - GravelKing Pro is a browser production studio (record, master, arrange) with a provenance layer: every export can carry an AI-attribution certificate. Live in production, bootstrapped. This is creative-production infrastructure with a data moat. Deck: [link].",
    },
    {
      name: "9. SBG Partners  [VERIFIED EMAIL: contact@sbg.vc]",
      why: "Seed fund with music/entertainment exposure. The only prospect with a verified public email.",
      route: "Email contact@sbg.vc directly. This is the first message to send - lowest friction.",
      angle: "Straight seed pitch with the strongest proof points up front; ask for a call, offer the demo.",
      message: "Subject: Live music-IP certification platform - seed. Hi SBG team - I'm the founder of GravelKing Pro (gravelkingpro.it.com): AI-attribution certificates + proprietary mastering, live on web and Google Play with billing wired, bootstrapped solo. Warner's Sureel acquisition shows where attribution is heading. Public deck attached - could I get 15 minutes this week or next?",
    },
    {
      name: "10. Sound Media Ventures",
      why: "Fund focused on music + media companies applying AI.",
      route: "Official site contact form; LinkedIn.",
      angle: "They want AI applied responsibly to music. The zero-rejection generation shield + mandatory AI labeling is the story: generative music that discloses itself.",
      message: "Hi - GravelKing Pro generates, masters, and certifies music where every AI contribution is labeled and every track is catalog-screened before certification. Responsible-AI music infrastructure, live in production. Deck: [link] - would love your read on the attribution angle.",
    },
    {
      name: "11. Musical AI  [partner/acquirer track]",
      why: "Rights-cleared AI training data company - adjacent, not competing. Reports of a 2026 raise are UNVERIFIED.",
      route: "Official site + LinkedIn to founders. Partnership conversation, not a cold pitch for money.",
      angle: "Their business needs attribution records; ours produces them. Open as data/API partnership - if it works, they're a natural acquirer of the registry.",
      message: "Hi - you're solving rights-cleared training; I'm solving rights-cleared output. GravelKing Pro certificates record human vs AI contribution per track with catalog screening. Feels like our registries should talk - open to a 20-minute call on a data partnership? gravelkingpro.it.com.",
    },
    {
      name: "12. AudioShake  [partner/acquirer track]",
      why: "AI stem separation leader; complementary tech. Reports about their seed round are UNVERIFIED.",
      route: "Official site contact; LinkedIn.",
      angle: "Their stems feed production; our certs prove provenance of the result. Integration partnership first (stems in, certified masters out), acquisition optionality later.",
      message: "Hi AudioShake team - GravelKing Pro masters and certifies tracks with AI-attribution built in. Your separation + our certification = a full provenance-safe production loop. Worth 20 minutes to explore an integration? Live product: gravelkingpro.it.com.",
    },
  ];

  for (const p of prospects) {
    ensureSpace(ctx, 120);
    sub(ctx, p.name, dark);
    text(ctx, "Why them: " + p.why, 9.5, gray);
    text(ctx, "Route: " + p.route, 9.5, gray);
    text(ctx, "Angle: " + p.angle, 9.5, gray);
    ctx.y -= 2;
    ensureSpace(ctx, 60);
    const msgLines = wrapText(ctx, p.message, 9.5, ctx.italic, contentW - 24);
    const boxH = msgLines.length * 13.5 + 16;
    ensureSpace(ctx, boxH + 10);
    ctx.page.drawRectangle({ x: margin, y: ctx.y - boxH + 12, width: contentW, height: boxH, color: rgb(0.96, 0.97, 0.99), borderColor: rgb(0.8, 0.84, 0.9), borderWidth: 0.75 });
    let my = ctx.y - 4;
    for (const l of msgLines) {
      ctx.page.drawText(l, { x: margin + 12, y: my, size: 9.5, font: ctx.italic, color: rgb(0.15, 0.2, 0.3) });
      my -= 13.5;
    }
    ctx.y = ctx.y - boxH + 12 - 14;
  }

  newPage(ctx);
  heading(ctx, "30-Day Bootstrap: Road to 100");
  body(ctx, "Goal: 100 combined wins in 30 days - paying subscribers, certificate purchases, investor conversations, or license leads. Zero ad spend. Everything below uses what already exists in the product.");
  sub(ctx, "Week 1 (Days 1-7): Ammunition");
  bullet(ctx, "Day 1: Send SBG Partners email (verified address). Submit Backbeat + Mindset forms same day - first-mover on your own momentum.");
  bullet(ctx, "Days 1-2: Certify 10 of your own best tracks so the public registry looks alive; post 3 cert verification links on socials.");
  bullet(ctx, "Days 3-5: Post the public promo deck + a 60-second master-and-certify screen recording on X, LinkedIn, TikTok, and r/WeAreTheMusicMakers (follow each community's self-promo rules).");
  bullet(ctx, "Days 5-7: Touch 1 to remaining 9 prospects via official forms/LinkedIn. Track every send in one spreadsheet: date, route, response.");
  sub(ctx, "Week 2 (Days 8-14): Creators");
  bullet(ctx, "DM 25 independent artists who post AI-assisted music: free Studio month + free cert doc for an honest testimonial. Target: 10 activated.");
  bullet(ctx, "Ship referral links to every activated creator - commissions only pay on verified paid invoices, so this costs nothing up front.");
  bullet(ctx, "Day 12: Touch 2 to all non-responding investors - the new proof point is 'X creators certified Y tracks this week.'");
  sub(ctx, "Week 3 (Days 15-21): Licensing wedge");
  bullet(ctx, "Identify 10 mid-tier distributors and sync agencies; send the enterprise angle (catalog audit for AI-era liability) via their partnership pages.");
  bullet(ctx, "Offer 3 of them a free 50-track pilot audit in exchange for a case-study quote. One yes = the license-deal win.");
  bullet(ctx, "Day 19: Touch 3 (short close) to remaining silent investors. Then stop touching - scarcity is real when you actually stop.");
  sub(ctx, "Week 4 (Days 22-30): Convert");
  bullet(ctx, "Push every activated free creator toward the $1.99 cert doc at their moment of release - the cert allowance email/banner does the work.");
  bullet(ctx, "Post the strongest creator testimonial + their verification link everywhere. Proof from a stranger beats any copy you write.");
  bullet(ctx, "Day 30: Score it. 100 = any mix of subscribers, cert purchases, investor calls held, pilot audits started. Whatever worked, double it in month 2; whatever got zero response, kill it.");
  divider(ctx);
  body(ctx, "Discipline rules: never promise investors a metric you have not hit; never send the private briefs; never pay for reach before organic proof exists; log every touch the day it happens.");

  footerAll(ctx, "GravelKing Pro - Outreach Playbook + Road to 100 - PRIVATE");
  const out = path.join(outDir, "GravelKingPro_Outreach_Playbook_Road_to_100_PRIVATE.pdf");
  fs.writeFileSync(out, await ctx.pdf.save());
  console.log("WROTE:" + out);
}

async function main() {
  const outDir = path.resolve(import.meta.dirname, "../../.local/outputs");
  fs.mkdirSync(outDir, { recursive: true });
  await buildValuationBrief(outDir);
  await buildOutreachPlaybook(outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
