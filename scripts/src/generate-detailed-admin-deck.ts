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

const outDir = path.resolve(import.meta.dirname, "../../artifacts/gravelkingpro/public");

const bold = StandardFonts.HelveticaBold;
const font = StandardFonts.Helvetica;
const italic = StandardFonts.HelveticaOblique;

async function createDetailedAdminDeck() {
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

  function heading(h: string, color = accent, size = 24) {
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

  function footer(isDark = false) {
    const c = isDark ? lightGray : gray;
    page.drawText("GravelKing Pro · Confidential Admin Deck · Internal Use Only", { x: margin, y: 20, size: 8, font: f, color: c });
  }

  function pageNumber(n: number, total: number) {
    page.drawText(`${n} / ${total}`, { x: pageW - margin - 24, y: 20, size: 8, font: f, color: gray });
  }

  const pages: { build: () => Promise<void>; dark?: boolean }[] = [];
  let pageIdx = 0;

  // COVER
  pages.push({
    dark: true,
    build: async () => {
      newPage(dark);
      page.drawText("GRAVELKING PRO", { x: margin, y: pageH - 160, size: 40, font: fb, color: white });
      page.drawText("Admin Strategy & Operations Deck", { x: margin, y: pageH - 215, size: 22, font: fb, color: accent });
      page.drawText("30-Day Plan · Valuation · Promos · Investor Targets", { x: margin, y: pageH - 255, size: 12, font: f, color: lightGray });
      page.drawText("Confidential · All N One LLC · July 2026", { x: margin, y: 60, size: 10, font: f, color: lightGray });
      footer(true);
    },
  });

  // PART 1: 30-DAY ZERO-DOLLAR PLAN (4 pages)
  pages.push({
    build: async () => {
      newPage();
      page.drawText("PART 1", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 16;
      heading("30-Day Zero-Dollar Subscriber Plan", dark, 24);
      body("The goal: convert the existing 30 daily visitors and 58 registered users into paying subscribers without spending on ads. Every tactic below is free except time.");
      y -= 12;
      subheading("Days 1–7: Fix the Funnel");
      bullet([
        "Publish the sign-in / service-worker fix immediately.",
        "Verify the mastering tool is 100% error-free in production.",
        "Add a free-trial CTA to the homepage hero.",
        "Send an email to all 58 users announcing the free trial and new fixes.",
      ]);
      y -= 12;
      subheading("Days 8–14: Content & Community");
      bullet([
        "Post one tool demo video per day on TikTok, Instagram Reels, and YouTube Shorts.",
        'Launch a 7-day "Master a Track Free" challenge in private music groups.',
        "Cross-post on Reddit r/WeAreTheMusicMakers and r/hiphop101.",
        "Go live on StarMaker or Instagram showing the Vocal Booth.",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("30-Day Plan (continued)");
      subheading("Days 15–21: Partnerships & Affiliates");
      bullet([
        "Reach out to 20 independent music producers and offer them a free Pro Plus month in exchange for an honest review.",
        "Create a referral code: existing users get 1 free week for every paying subscriber they bring.",
        "Pitch the Vocal Booth to 5 TikTok singing creators as a free content tool.",
        "List GravelKing Pro on free product directories (Product Hunt, BetaList, Indie Hackers).",
      ]);
      y -= 12;
      subheading("Days 22–30: Retention & Conversion");
      bullet([
        'Email trial users 48 hours before billing with a "how to cancel" transparency email (builds trust, reduces churn).',
        "Add in-app tooltips showing users the IP certificate they are building toward.",
        'Run a 48-hour "upgrade to Pro Plus" flash offer for Weekly users.',
        "Document every failed conversion and fix the top 3 UX blockers.",
      ]);
      y -= 16;
      page.drawRectangle({ x: margin, y: y - 50, width: contentW, height: 42, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("Target: 50 paying subscribers by Day 30. At $25/mo blended ARPU, that is $1,250 MRR from zero ad spend.", { x: margin + 12, y: y - 28, size: 10, font: fb, color: dark });
      y -= 58;
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("30-Day Plan (continued)");
      subheading("Daily Execution Rhythm");
      const rhythm = [
        ["Morning (30 min)", "Check analytics, respond to user feedback, post one social clip."],
        ["Midday (60 min)", "Reach out to 5 creators/producers or post in one community."],
        ["Evening (30 min)", "Review trial conversions, send follow-up emails, plan tomorrow's content."],
      ];
      for (const [time, task] of rhythm) {
        page.drawText(time, { x: margin, y, size: 11, font: fb, color: dark });
        y -= 16;
        page.drawText(task, { x: margin + 14, y, size: 10, font: f, color: gray });
        y -= 20;
      }
      y -= 12;
      subheading("KPIs to Track");
      bullet([
        "Daily unique visitors and sign-up rate",
        "Free trial starts and completion rate",
        "Paid conversion rate (target: 3% of free trial users)",
        "Churn in first 7 days (target: <15%)",
        "Viral posts: views, clicks, sign-ups attributed",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("30-Day Plan (continued)");
      subheading("Risks & Mitigations");
      bullet([
        "Risk: traffic is too low. Mitigation: post daily short-form content; each viral post can drive 500+ visitors.",
        "Risk: trial users do not convert. Mitigation: improve onboarding and show the IP certificate value immediately.",
        "Risk: tool errors return. Mitigation: keep maintenance mode toggle ready and monitor tool_errors table.",
        "Risk: customer support overload. Mitigation: create a FAQ page and canned responses for common issues.",
      ]);
      y -= 16;
      page.drawRectangle({ x: margin, y: y - 50, width: contentW, height: 42, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("Rule: if a tactic does not generate a sign-up within 48 hours, drop it and try the next one.", { x: margin + 12, y: y - 28, size: 10, font: fb, color: dark });
      y -= 58;
      pageNumber(++pageIdx, 0);
    },
  });

  // PART 2: HONEST VALUATION (4 pages)
  pages.push({
    build: async () => {
      newPage();
      page.drawText("PART 2", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 16;
      heading("Honest Valuation & Bank Appraisal", dark, 24);
      body("This is an honest internal evaluation. No inflated multiples. No pretend traction. We value the asset based on what exists today, not what could exist.");
      y -= 12;
      subheading("Current State Snapshot");
      bullet([
        "58 total registered users; 18 on Pro tier (likely manual/lifetime grants).",
        "0 active paid subscriptions through Stripe as of today.",
        "1 abandoned checkout session.",
        "62 pageviews today, 30 unique visitors.",
        "Product is live: IP certs, mastering, DAW, vocal booth, beat maker, converter, label hub.",
        "Custom domain, payment infrastructure, admin tooling, and verification API endpoint exist.",
      ]);
      y -= 12;
      subheading("Strengths");
      bullet([
        "Proprietary MLK V3.5 engine and Clean Room verification protocol.",
        "First-mover positioning in AI-assisted music chain-of-title.",
        "Live product, not a prototype.",
        "Low burn: solo/lean team, cloud infrastructure costs under control.",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Valuation (continued)");
      subheading("Weaknesses");
      bullet([
        "No paid subscription revenue yet.",
        "Funnel was broken until recently; conversion data is thin.",
        "No enterprise contracts or LOIs.",
        "Lean team limits execution bandwidth.",
        "Brand awareness is near zero outside existing contacts.",
      ]);
      y -= 12;
      subheading("Valuation Ranges");
      const vals = [
        ["Liquidation / Fire Sale", "$150K–$300K", "Codebase + IP engine + domain assets only."],
        ["Strategic Sale to Distributor", "$500K–$1.5M", "Value of verification engine and first-mover position."],
        ["Pre-Seed Investment Round", "$1M–$2M", "Product + team + IP + market opportunity."],
        ["Bank Collateral Appraisal", "$400K–$800K", "Hard tech asset value; limited by lack of revenue."],
      ];
      for (const [scenario, range, note] of vals) {
        page.drawText(scenario, { x: margin, y, size: 11, font: fb, color: dark });
        page.drawText(range, { x: margin + 180, y, size: 11, font: fb, color: accent });
        y -= 16;
        page.drawText(note, { x: margin + 14, y, size: 9, font: f, color: gray });
        y -= 20;
      }
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Valuation (continued)");
      subheading("Can this stand as bank collateral?");
      body("Banks lend against cash flow, hard assets, or accounts receivable. A pre-revenue SaaS is difficult to collateralize. However, the technology asset can be appraised and pledged as part of a broader loan package.");
      y -= 12;
      bullet([
        "Document the MLK V3.5 engine, verification protocol, and codebase ownership.",
        "Get an independent IP appraisal from a valuation firm specializing in software/technology.",
        "Prepare a 3-year financial projection showing revenue ramp.",
        "Show the payment infrastructure and live user base as evidence of commercial viability.",
      ]);
      y -= 12;
      subheading("Recommended loan package:");
      bullet([
        "SBA microloan or small-business line: $25K–$50K based on personal credit + business plan.",
        "Equipment/cloud credit line: $50K–$100K against infrastructure spend.",
        "IP-backed loan: $100K–$300K with a formal technology appraisal and UCC filing.",
      ]);
      y -= 12;
      body("A realistic bank loan backed by the technology asset alone is likely $100K–$300K at this stage. A larger loan requires revenue or a personal guarantee.");
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Valuation (continued)");
      subheading("What to do to increase valuation in 90 days");
      bullet([
        "Reach 100 paying subscribers: this adds ~$30K ARR and changes the conversation.",
        "Sign 1 LOI with a distributor or sync agency: enterprise pipeline is the biggest valuation driver.",
        "File provisional patents or trade-secret documentation on the verification protocol.",
        "Publish a case study showing a real artist using the IP certificate.",
        "Build a waitlist of 500+ emails for the enterprise Verify API.",
      ]);
      y -= 16;
      page.drawRectangle({ x: margin, y: y - 60, width: contentW, height: 52, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("Bottom line: the company is worth $500K–$1M today as a strategic technology asset. With 100 paying subscribers and 1 enterprise LOI, it becomes a $2M–$5M company.", { x: margin + 12, y: y - 30, size: 10, font: fb, color: dark });
      y -= 68;
      pageNumber(++pageIdx, 0);
    },
  });

  // PART 3: 7-DAY PROMO POSTS (3 pages)
  pages.push({
    build: async () => {
      newPage();
      page.drawText("PART 3", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 16;
      heading("7-Day Promo Post Calendar", dark, 24);
      body("Use these posts across platforms. Tailor the hook and length to each channel.");
      y -= 12;
      subheading("Day 1: Hook — The Rights Crisis");
      page.drawText("Instagram / TikTok / Facebook", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 14;
      body("200 million AI tracks hit streaming last year. If you used AI to help write your song, can you prove YOU made it? GravelKing Pro can. Start free at gravelkingpro.com.");
      y -= 10;
      page.drawText("LinkedIn / X", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 14;
      body("The Copyright Office says AI-only works get no protection. The real question: how do you prove your human contribution? We built a platform that does exactly that. #MusicTech #AI #Copyright");
      y -= 10;
      page.drawText("YouTube Shorts", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 14;
      body("Screen recording: open the Songwriting Studio, show the AI draft, rewrite it, and reveal the authorship score. End with CTA.");
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Promo Calendar (continued)");
      subheading("Day 2: Tool Demo — Mastering");
      body('Post: Upload a rough mix. Pick a preset. Get a mastered WAV. Show before/after waveforms. "This is how independent artists sound radio-ready without a studio." Link in bio.');
      y -= 10;
      subheading("Day 3: Tool Demo — Vocal Booth");
      body('Post: Record a vocal over a backing track in the browser. Show the teleprompter and the mixdown. Caption: "Your home studio is now a professional booth."');
      y -= 10;
      subheading("Day 4: Tool Demo — Live DAW");
      body('Post: Multi-track screen recording showing EQ, reverb, and mixdown. Caption: "No download. No $400 DAW. Just a browser tab and your ideas."');
      y -= 10;
      subheading("Day 5: Social Proof / IP Certificate");
      body('Post: Show the IP certificate UI. "This is your proof-of-ownership document. Not metadata. Not a receipt. A forensic record of your human creative contribution."');
      y -= 10;
      subheading("Day 6: Offer — Free Trial");
      body('Post: "7-day free trial of Pro Plus. Full studio, unlimited runs, IP certificates. Cancel anytime. Try it at gravelkingpro.com."');
      y -= 10;
      subheading("Day 7: Behind the Scenes / Founder");
      body("Post: Personal founder story. Kevin Morris, the MLK engine, why the problem matters. Build trust and humanize the brand.");
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Promo Calendar (continued)");
      subheading("Posting cadence by platform");
      const cadence = [
        ["TikTok / Reels", "1–2 short videos per day. Use trending audio, but keep the message about ownership/proof."],
        ["YouTube Shorts", "1 short per day. More educational, less hype."],
        ["X / Twitter", "3–5 posts per day: one hook, one tool tip, one thread, one reply to a music account."],
        ["LinkedIn", "1 post per day. Frame as music-tech/founder journey. Target investors and distributors."],
        ["Facebook", "1 post per day. Join indie artist groups and share value-first."],
        ["Reddit", "Post in r/WeAreTheMusicMakers, r/hiphop101, r/edmproduction. No hard sell; answer questions."],
      ];
      for (const [platform, tactic] of cadence) {
        page.drawText(platform, { x: margin, y, size: 11, font: fb, color: dark });
        y -= 16;
        page.drawText(tactic, { x: margin + 14, y, size: 10, font: f, color: gray });
        y -= 20;
      }
      pageNumber(++pageIdx, 0);
    },
  });

  // PART 4: LINKEDIN TARGETS & OUTREACH (3 pages)
  pages.push({
    build: async () => {
      newPage();
      page.drawText("PART 4", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 16;
      heading("LinkedIn Targets: Early Sell & Investment", dark, 24);
      body("These are real people active in music-tech, media, and angel investing. Search them on LinkedIn, connect with a personalized note, and pitch the problem first.");
      y -= 12;
      subheading("Tier 1: Music-Tech Angels & Operators");
      const targets = [
        ["Larry Marcus", "Marcy Venture Partners, Pandora founding investor, music-focused."],
        ["Scooter Braun", "SB Projects, Ithaca Holdings, artist/tech investor."],
        ["Cooper Turley", "Music/crypto angel, active in music tech."],
        ["Troy Carter", "Atomic, music-tech investor."],
        ["Kevin Mayer", "Former TikTok CEO, Disney+, media/tech investor."],
        ["David Kalt", "Reverb founder, music/tech investor."],
        ["Peter Gabriel", "Musician, tech investor, WITNESS founder."],
        ["Craig Kaltman", "Atlantic Records, music/tech investor."],
      ];
      for (const [name, note] of targets) {
        page.drawText(name, { x: margin, y, size: 11, font: fb, color: dark });
        y -= 16;
        page.drawText(note, { x: margin + 14, y, size: 9, font: f, color: gray });
        y -= 20;
      }
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("LinkedIn Targets (continued)");
      subheading("Tier 2: Generalist Angels & Syndicates");
      const targets = [
        ["Ron Conway", "SV Angel, prolific seed investor."],
        ["Gary Vaynerchuk", "VaynerMedia, angel investor."],
        ["Eric Ries", "Long-Term Stock Exchange, Lean Startup."],
        ["Auren Hoffman", "SafeGraph, angel investor."],
        ["Charlie Songhurst", "Former Microsoft strategy, angel investor."],
        ["Herman Kienhuis", "Curiosity VC, software investor."],
        ["Mark Gillespie", "Music manager/investor."],
      ];
      for (const [name, note] of targets) {
        page.drawText(name, { x: margin, y, size: 11, font: fb, color: dark });
        y -= 16;
        page.drawText(note, { x: margin + 14, y, size: 9, font: f, color: gray });
        y -= 20;
      }
      y -= 12;
      subheading("Outreach Script");
      body("Subject: AI-assisted music chain-of-title — looking for feedback. Hi [Name], I built GravelKing Pro, a browser studio that proves human creative contribution on AI-assisted tracks. The Copyright Office has made the legal standard clear; the missing piece is a platform that captures proof. We are live, processing audio, and raising a small seed. Would love your take on the space. 10-minute call?");
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("LinkedIn Targets (continued)");
      subheading("Strategic Buyer Targets (Early Sell / Acquisition)");
      const buyers = [
        ["Independent Distributors", "DistroKid, TuneCore, CD Baby, UnitedMasters — need chain-of-title verification."],
        ["Sync Licensing Agencies", "Musicbed, Epidemic Sound, Artlist — chain-of-title is contractually mandatory."],
        ["Publishing Administrators", "Kobalt, Songtrust, AMRA — need provable authorship."],
        ["DAW / Plugin Companies", "Splice, LANDR, iZotope — could acquire the IP engine."],
        ["AI Music Startups", "Suno, Udio — may need compliance/authorship tooling."],
      ];
      for (const [name, note] of buyers) {
        page.drawText(name, { x: margin, y, size: 11, font: fb, color: dark });
        y -= 16;
        page.drawText(note, { x: margin + 14, y, size: 9, font: f, color: gray });
        y -= 20;
      }
      y -= 12;
      subheading("How to approach strategic buyers");
      bullet([
        "Lead with their liability, not your product.",
        "Show a 2-minute demo of verify-cert in action.",
        "Offer a 30-day free API integration pilot.",
        "Quote a $25K–$100K annual capacity license as the starting point.",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  // PART 5: OTHER STRATEGIC INFO (3 pages)
  pages.push({
    build: async () => {
      newPage();
      page.drawText("PART 5", { x: margin, y, size: 10, font: fb, color: accent });
      y -= 16;
      heading("Other Strategic Intelligence", dark, 24);
      subheading("Competitive Landscape");
      bullet([
        "Splice / LANDR: mastering and samples, no IP/certification.",
        "Suno / Udio: AI generation, no human authorship proof.",
        "Stem-splitting tools (Spleeter, Demucs): utility, no rights infrastructure.",
        "No direct competitor in AI-assisted music chain-of-title verification.",
      ]);
      y -= 12;
      subheading("Key Risks");
      bullet([
        "Legal risk: copyright law evolves. Mitigation: stay aligned with Copyright Office guidance, not ahead of it.",
        "Technical risk: a competitor replicates the verification API. Mitigation: accumulated server-side records are hard to copy.",
        "Market risk: artists do not care about IP until they have a hit. Mitigation: sell the creative tools first, then the certificate.",
        "Execution risk: lean team limits speed. Mitigation: raise seed to hire sales and support.",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Strategic Intelligence (continued)");
      subheading("KPI Dashboard — First 90 Days");
      const kpis = [
        ["Users", "58", "200", "500"],
        ["Paying subs", "0", "50", "150"],
        ["MRR", "$0", "$1,250", "$4,500"],
        ["Enterprise LOIs", "0", "1", "3"],
        ["Verify API calls", "0", "100", "5,000"],
        ["Social followers", "?", "1,000", "5,000"],
      ];
      page.drawText("Metric", { x: margin, y, size: 10, font: fb, color: dark });
      page.drawText("Today", { x: margin + 140, y, size: 10, font: fb, color: dark });
      page.drawText("30 days", { x: margin + 210, y, size: 10, font: fb, color: dark });
      page.drawText("90 days", { x: margin + 280, y, size: 10, font: fb, color: dark });
      y -= 16;
      for (const [metric, today, d30, d90] of kpis) {
        page.drawText(metric, { x: margin, y, size: 9, font: f, color: gray });
        page.drawText(today, { x: margin + 140, y, size: 9, font: f, color: gray });
        page.drawText(d30, { x: margin + 210, y, size: 9, font: f, color: accent });
        page.drawText(d90, { x: margin + 280, y, size: 9, font: f, color: accent });
        y -= 14;
      }
      y -= 16;
      subheading("What to Measure Weekly");
      bullet([
        "Visitor-to-signup conversion rate",
        "Signup-to-trial start rate",
        "Trial-to-paid conversion rate",
        "7-day and 30-day retention",
        "Cost per acquisition (once ads start)",
        "Support ticket volume and resolution time",
      ]);
      pageNumber(++pageIdx, 0);
    },
  });

  pages.push({
    build: async () => {
      newPage();
      heading("Strategic Intelligence (continued)");
      subheading("Next Decisions for the Founder");
      bullet([
        "Raise or bootstrap? Recommendation: raise $250K seed to accelerate sales and support.",
        "Consumer or enterprise first? Recommendation: both, but consumer pays bills while enterprise builds the moat.",
        "Build more tools or sell existing ones? Recommendation: lock the 4 pillars; do not add bloat.",
        'Trademark the IP certificate name? Yes — file trademark on "Clean Room Certificate" or similar.',
        "Patent or trade secret? Trade secret is safer and faster; document internally.",
      ]);
      y -= 16;
      page.drawRectangle({ x: margin, y: y - 60, width: contentW, height: 52, color: offWhite, borderColor: accent, borderWidth: 1 });
      page.drawText("The next 30 days are about proof of conversion. The next 90 days are about proof of enterprise demand. Everything else is a distraction.", { x: margin + 12, y: y - 30, size: 10, font: fb, color: dark });
      y -= 68;
      pageNumber(++pageIdx, 0);
    },
  });

  // CLOSING
  pages.push({
    dark: true,
    build: async () => {
      newPage(dark);
      page.drawText("Execute the 30-day plan.", { x: margin, y: pageH - 200, size: 22, font: fb, color: white });
      page.drawText("Convert visitors. Close one enterprise conversation. Prove the value.", { x: margin, y: pageH - 240, size: 12, font: f, color: lightGray });
      page.drawText("All N One LLC · Internal Use Only · July 2026", { x: margin, y: 60, size: 10, font: f, color: lightGray });
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

  const outPath = path.join(outDir, "GravelKingPro_DetailedAdminDeck.pdf");
  fs.writeFileSync(outPath, await pdf.save());
  console.log(`Detailed admin deck generated: ${outPath} (${(await pdf.save()).length} bytes)`);
}

createDetailedAdminDeck().catch((err) => {
  console.error(err);
  process.exit(1);
});
