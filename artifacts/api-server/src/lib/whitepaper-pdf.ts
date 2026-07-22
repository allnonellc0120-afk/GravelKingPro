/**
 * Server-side generator for the GravelKing Pro MLK V3.5 Technical Brief PDF.
 *
 * Single source of truth for the brief: `GET /api/v1/download-whitepaper`
 * (alias `/api/whitepaper.pdf`) streams this document, and the /whitepaper
 * page's download button points at that endpoint.
 *
 * Typography is deliberately large (12pt body / 14.5pt headings / 22pt
 * section titles) for comfortable reading on screens and in print.
 *
 * The document is fully static, so the buffer is built once and cached
 * for the lifetime of the process.
 */
import { jsPDF } from "jspdf";

const W = 210; // A4 width, mm
const MARGIN_L = 20;
const MARGIN_R = W - 20;
const LINE_W = MARGIN_R - MARGIN_L;

let cached: Buffer | null = null;

export function buildWhitepaperPdf(): Buffer {
  if (cached) return cached;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 0;

  const paintBg = () => {
    doc.setFillColor(9, 9, 11);
    doc.rect(0, 0, W, 297, "F");
  };

  const addPage = () => {
    doc.addPage();
    paintBg();
    y = 26;
  };

  // ── Cover ──────────────────────────────────────────────────────────────────
  paintBg();
  doc.setTextColor(201, 162, 39);
  doc.setFontSize(40);
  doc.setFont("helvetica", "bold");
  doc.text("GravelKing Pro", W / 2, 62, { align: "center" });
  doc.setFontSize(17);
  doc.setTextColor(251, 191, 36);
  doc.text("MLK V3.5 — Signal-Level Audio Security", W / 2, 77, { align: "center" });
  doc.setFontSize(12.5);
  doc.setTextColor(161, 161, 170);
  doc.text("Technical Brief for Enterprise Partners", W / 2, 89, { align: "center" });
  doc.setFontSize(10.5);
  doc.text("All N One LLC  ·  GravelKing Productions  ·  2026", W / 2, 99, { align: "center" });

  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_L, 108, MARGIN_R, 108);

  const stats: Array<[string, string]> = [
    ["$43B", "Creator Economy"],
    ["LSB", "Signal-Level"],
    ["FRE 901(b)(9)", "Court-Admissible"],
    ["< 2ms", "Verification"],
  ];
  stats.forEach(([val, lbl], i) => {
    const x = MARGIN_L + i * (LINE_W / 4) + LINE_W / 8;
    doc.setFontSize(16.5);
    doc.setTextColor(201, 162, 39);
    doc.setFont("helvetica", "bold");
    doc.text(val, x, 130, { align: "center" });
    doc.setFontSize(9.5);
    doc.setTextColor(113, 113, 122);
    doc.setFont("helvetica", "normal");
    doc.text(lbl, x, 137, { align: "center" });
  });

  doc.setFontSize(10.5);
  doc.setTextColor(113, 113, 122);
  doc.text("CONFIDENTIAL — For authorized enterprise evaluation only.", W / 2, 268, { align: "center" });
  doc.text("gravelkingpro.it.com  ·  kevm@gravelkingpro.it.com", W / 2, 276, { align: "center" });

  // ── Layout helpers ──────────────────────────────────────────────────────────
  const section = (num: string, title: string) => {
    addPage();
    doc.setFontSize(10);
    doc.setTextColor(201, 162, 39);
    doc.setFont("helvetica", "bold");
    doc.text(`SECTION ${num}`, MARGIN_L, y);
    y += 7;
    doc.setFontSize(22);
    doc.setTextColor(240, 240, 240);
    const titleLines: string[] = doc.splitTextToSize(title, LINE_W);
    titleLines.forEach((line) => {
      doc.text(line, MARGIN_L, y);
      y += 9;
    });
    doc.setDrawColor(201, 162, 39);
    doc.setLineWidth(0.4);
    doc.line(MARGIN_L, y, MARGIN_R, y);
    y += 9;
  };

  const body = (text: string) => {
    doc.setFontSize(12);
    doc.setTextColor(170, 170, 180);
    doc.setFont("helvetica", "normal");
    const lines: string[] = doc.splitTextToSize(text, LINE_W);
    lines.forEach((line) => {
      if (y > 270) addPage();
      doc.text(line, MARGIN_L, y);
      y += 6.4;
    });
    y += 3.5;
  };

  const heading = (text: string) => {
    if (y > 256) addPage();
    y += 2;
    doc.setFontSize(14.5);
    doc.setTextColor(251, 191, 36);
    doc.setFont("helvetica", "bold");
    doc.text(text, MARGIN_L, y);
    y += 7.5;
    doc.setFont("helvetica", "normal");
  };

  const bullet = (text: string) => {
    if (y > 270) addPage();
    doc.setFontSize(12);
    doc.setTextColor(170, 170, 180);
    const lines: string[] = doc.splitTextToSize(`• ${text}`, LINE_W - 5);
    lines.forEach((line, i) => {
      if (y > 272) addPage();
      doc.text(line, MARGIN_L + (i > 0 ? 5 : 0), y);
      y += 6.2;
    });
    y += 0.8;
  };

  // ── Section 1 ───────────────────────────────────────────────────────────────
  section("1", "Executive Summary & Market Imperative");
  body(
    "The 2026 AI content landscape has created an urgent trust deficit for digital creators. Generative AI tools now produce audio indistinguishable from human-authored recordings, AI training datasets ingest unlicensed catalog without attribution, and platform-level metadata (ID3 tags, ISRC codes) can be stripped, reassigned, or fraudulently claimed by any actor with basic tooling.",
  );
  body(
    "GravelKing Pro MLK V3.5 solves this at the signal level — not the metadata level. Rather than relying on external ledgers, blockchain timestamps, or third-party registries that can be circumvented, MLK V3.5 embeds cryptographic proof of ownership directly into the audio bitstream using dual-anchor LSB steganography. This proof travels with the track permanently, survives platform distribution, and is verified server-authoritatively — making chain-of-custody disputes resolvable without court-ordered discovery.",
  );
  heading("Market Context");
  bullet("$43B+ global creator economy (2026), growing 18% YoY");
  bullet("EU AI Act (enforcement Aug 2026) requires provenance declarations for AI-assisted content");
  bullet("U.S. Copyright Office: Thaler v. Vidal (2023) establishes human-authorship threshold requirement");
  bullet("Platform DSPs face regulatory pressure to verify content provenance before monetization");
  bullet("PortalBunny and similar creator ecosystems require native authenticity infrastructure as they scale");

  // ── Section 2 ───────────────────────────────────────────────────────────────
  section("2", "Ingestion Defense & Bad-Actor Mitigation");
  body(
    "Before any signal-level watermark is embedded, every asset passes through a three-tier ingestion validation pipeline. This prevents adversarial actors from registering stolen, AI-generated, or commercially licensed content and receiving a fraudulent GravelKing certificate.",
  );
  heading("Tier 1 — Metadata Collision Check");
  body("Scans all submitted metadata fields (filename, title, artist, ISRC, ISWC, UPC) against a curated registry of known commercial patterns. Detects:");
  bullet("ISRC format collisions (format: CC-XXX-YY-NNNNN)");
  bullet("Major label/DSP identifiers (Sony, Universal, Warner, Atlantic, Columbia, etc.)");
  bullet("Known artist name signatures in the commercial blacklist");
  heading("Tier 2 — Spectral Audio Fingerprinting");
  body(
    "Runs ffmpeg ebur128 loudness analysis on the submitted audio. Extracts integrated LUFS and true peak dBFS from the EBU R128 report. Rejects:",
  );
  bullet("Near-silence signals (integrated LUFS < -55) — copied carrier tracks or empty submissions");
  bullet("Artificially maxed signals (peak dBFS > -0.5) — ripped/clipped commercial masters");
  bullet("Single-frequency test tones — bot-generated submissions");
  heading("Tier 3 — Digital Assertion Signature");
  body(
    "Requires an explicit machine-readable copyright ownership assertion (author_assertion: true) in every ingest request. This field is included in the forensic certificate as a signed warrant. Absent the warrant, the server returns HTTP 422 ERR_COPYRIGHT_WARRANT_REQUIRED before any processing occurs.",
  );

  // ── Section 3 ───────────────────────────────────────────────────────────────
  section("3", "Court-Admissible Forensic Chain-of-Title");
  heading("Dual-Anchor Split-Key Architecture");
  body(
    "MLK V3.5 uses a nominator/denominator split: the two halves of the cryptographic proof are stored separately, making verification server-authoritative by design.",
  );
  bullet(
    "Anchor A (Nominator) — embedded into the audio's least-significant bits. Encodes SHA-256(contentHash | artistHandle | certId), truncated to 32 hex chars. Survives lossless export (WAV, AIFF, FLAC). Travels with the signal, not the container.",
  );
  bullet(
    "Anchor B (Denominator) — stored exclusively on GravelKing servers. Never transmitted to any client. The server-side complement required to verify the full handshake.",
  );
  bullet(
    "HMAC-SHA256 Handshake — HMAC(SESSION_SECRET, certId | nominator | denominator). Tamper-evident binding between the in-signal anchor and the server record.",
  );
  heading("Verification Protocol");
  body(
    "POST /api/kernel/verify-signal accepts any WAV file and returns a structured VerifyResult. Warrant status is one of:",
  );
  bullet("INTACT — Both anchors present, HMAC matches, content hash reconstructs correctly");
  bullet(
    "TAMPERED — Anchor A present, but Anchor B missing, HMAC mismatches, or content hash drift detected. Triggers Default of Warrant in downstream legal proceedings.",
  );
  bullet("NO_WATERMARK — No GravelKing LSB signature detected. Track was not issued by this platform.");
  heading("Legal Standards Met");
  bullet("FRE Rule 901(b)(9) — SHA-256 content fingerprint satisfies federal digital evidence authentication");
  bullet("Thaler v. Vidal (2023) — Human authorship score >= 25% threshold for copyright assertability");
  bullet("Dual-storage (PostgreSQL + Google Firestore) prevents spoliation objections");
  bullet("ISO-8601 UTC certifiedAt timestamp predates any third-party claim");

  // ── Section 4 ───────────────────────────────────────────────────────────────
  section("4", "B2B Platform Integration Model");
  body(
    "GravelKing Pro is designed for direct API integration by creator economy platforms, DSPs, and brand-content marketplaces. The integration surface is a RESTful JSON API with multipart/form-data ingest.",
  );
  heading("Core Endpoints");
  bullet(
    "POST /api/v1/ingest (alias: /api/kernel/master) — Submit audio for MLK V3.5 processing + cert embedding. Returns processed stream + X-GK-CertId header.",
  );
  bullet(
    "POST /api/v1/verify (alias: /api/kernel/verify-signal) — Public clean-room verification. No auth required. < 2ms median response for pre-certified tracks.",
  );
  bullet("GET /api/court-cert/:certId — Structured forensic certificate JSON.");
  bullet("GET /api/court-cert/:certId.pdf — Court-ready PDF certificate.");
  bullet("GET /api/v1/download-whitepaper — Stream this technical brief as a PDF.");
  bullet("POST /api/v1/lead-capture — Enterprise onboarding. Issues 7-day demo API key.");
  bullet("GET /api/v1/whitepaper-spec — Structured JSON data model of this document.");
  heading("Supported Media Formats");
  bullet("Lossless: WAV (PCM 16/24/32-bit), FLAC, AIFF — LSB embedding fully preserved");
  bullet("Lossy (ingest-only): MP3, AAC, OGG, Opus, M4A — auto-converted to WAV pre-embedding");
  bullet("Video containers (audio extraction): MP4, MOV, MKV, WebM — ffmpeg audio strip on arrival");
  bullet("Sample rates: 44.1 kHz, 48 kHz, 96 kHz — all supported via ffmpeg normalization");
  heading("Integration Flow for Creator Platforms");
  body(
    "1. Platform calls POST /api/v1/ingest with creator's audio file + author_assertion: true\n2. MLK V3.5 validates through the 3-tier ingestion filter\n3. If cleared: applies mastering chain, embeds Anchor A watermark, stores Anchor B + cert\n4. Returns processed audio to platform + certId header\n5. Platform stores certId against the creator's content record\n6. Any downstream dispute: call POST /api/v1/verify with the distributed file — warrant status returns in < 2ms",
  );
  heading("Throughput & SLA");
  bullet("Median verification latency: < 2ms (pre-certified tracks, in-region)");
  bullet("Mastering + embedding: 8-45 seconds per track depending on duration and format");
  bullet("Concurrency: horizontal Docker scaling, up to 12 parallel processing lanes per node");
  bullet("Webhook delivery for async cert events: configurable per API key");

  // ── Section 5 ───────────────────────────────────────────────────────────────
  section("5", "Containerized Infrastructure Moat");
  body(
    "The MLK V3.5 kernel is implemented as a native C-bound DSP pipeline exposed through a Node.js FFI layer. The architecture is designed for zero-trust enterprise cloud deployment and on-premise air-gapped installations.",
  );
  heading("Core Architecture");
  bullet("Docker multi-stage build: Node.js 22 LTS + ffmpeg-headless + native kernel binary");
  bullet("mmap() for zero-copy audio buffer access — no heap allocation for signal processing");
  bullet("mlockall(MCL_CURRENT | MCL_FUTURE) — pins kernel pages, prevents swap exposure of cert material");
  bullet("Process isolation: each ingest request runs in a sandboxed child process with resource limits");
  bullet("Zero secrets in Docker image — all credentials injected at runtime");
  heading("Deployment Targets");
  bullet("SaaS (gravelkingpro.it.com) — immediate access, usage-based billing");
  bullet("AWS ECS / GCP Cloud Run — container registry publish, auto-scale on CPU, 99.9% SLA");
  bullet("On-premise Docker Compose — air-gapped for major labels and studios, no data egress");
  bullet("White-label API — custom subdomain, volume pricing, dedicated webhooks, custom branding");
  heading("Security Posture");
  bullet("SESSION_SECRET-derived HMAC — never stored in application code or Docker image");
  bullet("Database dual-write: PostgreSQL (queryable) + Google Firestore (append-only audit trail)");
  bullet("Admin endpoints require separate ADMIN_KEY header — never exposed on public routes");
  bullet("No telemetry to third parties — all processing is on-instance");

  // ── Contact page ────────────────────────────────────────────────────────────
  addPage();
  doc.setFontSize(26);
  doc.setTextColor(240, 240, 240);
  doc.setFont("helvetica", "bold");
  doc.text("Ready to integrate?", W / 2, 80, { align: "center" });
  doc.setFontSize(12.5);
  doc.setTextColor(170, 170, 180);
  doc.setFont("helvetica", "normal");
  doc.text("Start with the public verification demo, then request enterprise API access.", W / 2, 93, { align: "center" });
  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_L, 102, MARGIN_R, 102);
  const contacts: Array<[string, string]> = [
    ["Demo Lab", "gravelkingpro.it.com/verify"],
    ["Enterprise Contact", "kevm@gravelkingpro.it.com"],
    ["Technical Brief", "gravelkingpro.it.com/whitepaper"],
    ["PDF Download (API)", "gravelkingpro.it.com/api/v1/download-whitepaper"],
    ["API Spec (JSON)", "gravelkingpro.it.com/api/v1/whitepaper-spec"],
  ];
  y = 120;
  contacts.forEach(([label, val]) => {
    doc.setFontSize(11);
    doc.setTextColor(113, 113, 122);
    doc.text(label, MARGIN_L, y);
    doc.setFontSize(11.5);
    doc.setTextColor(201, 162, 39);
    doc.text(val, MARGIN_L + 56, y);
    y += 12;
  });
  doc.setFontSize(10.5);
  doc.setTextColor(113, 113, 122);
  doc.text("All N One LLC  ·  GravelKing Productions  ·  © 2026", W / 2, 268, { align: "center" });
  doc.text("CONFIDENTIAL — For authorized enterprise evaluation only.", W / 2, 276, { align: "center" });

  cached = Buffer.from(doc.output("arraybuffer"));
  return cached;
}
