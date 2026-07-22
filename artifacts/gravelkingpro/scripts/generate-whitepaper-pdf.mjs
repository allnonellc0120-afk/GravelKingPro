// Generates the GravelKing Pro MLK V3.5 Technical Brief PDF (same content as
// the /whitepaper page's client-side download) for direct sharing.
import { jsPDF } from "jspdf";
import { writeFileSync } from "node:fs";

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const W = 210;
const marginL = 20;
const marginR = W - 20;
const lineW = marginR - marginL;
let y = 0;

const addPage = () => { doc.addPage(); y = 24; };

// ── Cover ──
doc.setFillColor(9, 9, 11);
doc.rect(0, 0, W, 297, "F");
doc.setTextColor(201, 162, 39);
doc.setFontSize(36);
doc.setFont("helvetica", "bold");
doc.text("GravelKing Pro", W / 2, 60, { align: "center" });
doc.setFontSize(15);
doc.setTextColor(251, 191, 36);
doc.text("MLK V3.5 — Signal-Level Audio Security", W / 2, 74, { align: "center" });
doc.setFontSize(11);
doc.setTextColor(161, 161, 170);
doc.text("Technical Brief for Enterprise Partners", W / 2, 86, { align: "center" });
doc.setFontSize(9);
doc.text("All N One LLC  ·  GravelKing Productions  ·  2026", W / 2, 96, { align: "center" });

doc.setDrawColor(201, 162, 39);
doc.setLineWidth(0.5);
doc.line(marginL, 104, marginR, 104);

const stats = [["$43B", "Creator Economy"], ["LSB", "Signal-Level"], ["FRE 901(b)(9)", "Court-Admissible"], ["< 2ms", "Verification"]];
stats.forEach(([val, lbl], i) => {
  const x = marginL + i * (lineW / 4) + (lineW / 8);
  doc.setFontSize(16);
  doc.setTextColor(201, 162, 39);
  doc.setFont("helvetica", "bold");
  doc.text(val, x, 125, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.setFont("helvetica", "normal");
  doc.text(lbl, x, 131, { align: "center" });
});

doc.setFontSize(9);
doc.setTextColor(113, 113, 122);
doc.text("CONFIDENTIAL — For authorized enterprise evaluation only.", W / 2, 270, { align: "center" });
doc.text("gravelkingpro.it.com  ·  kevm@gravelkingpro.it.com", W / 2, 277, { align: "center" });

const section = (num, title) => {
  addPage();
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, W, 297, "F");
  doc.setFontSize(8);
  doc.setTextColor(201, 162, 39);
  doc.setFont("helvetica", "bold");
  doc.text(`SECTION ${num}`, marginL, y);
  y += 6;
  doc.setFontSize(18);
  doc.setTextColor(240, 240, 240);
  doc.text(title, marginL, y);
  y += 8;
  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.4);
  doc.line(marginL, y, marginR, y);
  y += 8;
};

const body = (text) => {
  doc.setFontSize(9.5);
  doc.setTextColor(161, 161, 170);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, lineW);
  lines.forEach((line) => {
    if (y > 272) addPage();
    doc.text(line, marginL, y);
    y += 5.2;
  });
  y += 3;
};

const heading = (text) => {
  if (y > 268) addPage();
  doc.setFontSize(11);
  doc.setTextColor(251, 191, 36);
  doc.setFont("helvetica", "bold");
  doc.text(text, marginL, y);
  y += 6;
  doc.setFont("helvetica", "normal");
};

const bullet = (text) => {
  if (y > 272) addPage();
  doc.setFontSize(9.5);
  doc.setTextColor(161, 161, 170);
  const lines = doc.splitTextToSize(`• ${text}`, lineW - 4);
  lines.forEach((line, i) => {
    doc.text(line, marginL + (i > 0 ? 4 : 0), y);
    y += 5;
  });
};

// ── Section 1 ──
section("1", "Executive Summary & Market Imperative");
body("The 2026 AI content landscape has created an urgent trust deficit for digital creators. Generative AI tools now produce audio indistinguishable from human-authored recordings, AI training datasets ingest unlicensed catalog without attribution, and platform-level metadata (ID3 tags, ISRC codes) can be stripped, reassigned, or fraudulently claimed by any actor with basic tooling.");
body("GravelKing Pro MLK V3.5 solves this at the signal level — not the metadata level. Rather than relying on external ledgers, blockchain timestamps, or third-party registries that can be circumvented, MLK V3.5 embeds cryptographic proof of ownership directly into the audio bitstream using dual-anchor LSB steganography. This proof travels with the track permanently, survives platform distribution, and is verified server-authoritatively — making chain-of-custody disputes resolvable without court-ordered discovery.");
heading("Market Context");
bullet("$43B+ global creator economy (2026), growing 18% YoY");
bullet("EU AI Act (enforcement Aug 2026) requires provenance declarations for AI-assisted content");
bullet("U.S. Copyright Office: Thaler v. Vidal (2023) establishes human-authorship threshold requirement");
bullet("Platform DSPs face regulatory pressure to verify content provenance before monetization");
bullet("PortalBunny and similar creator ecosystems require native authenticity infrastructure as they scale");

// ── Section 2 ──
section("2", "Ingestion Defense & Bad-Actor Mitigation");
body("Before any signal-level watermark is embedded, every asset passes through a three-tier ingestion validation pipeline. This prevents adversarial actors from registering stolen, AI-generated, or commercially licensed content and receiving a fraudulent GravelKing certificate.");
heading("Tier 1 — Metadata Collision Check");
body("Scans all submitted metadata fields (filename, title, artist, ISRC, ISWC, UPC) against a curated registry of known commercial patterns. Detects:");
bullet("ISRC format collisions (format: CC-XXX-YY-NNNNN)");
bullet("Major label/DSP identifiers (Sony, Universal, Warner, Atlantic, Columbia, etc.)");
bullet("Known artist name signatures in the commercial blacklist");
heading("Tier 2 — Spectral Audio Fingerprinting");
body("Runs ffmpeg ebur128 loudness analysis on the submitted audio. Extracts integrated LUFS (loudness units relative to full scale) and true peak dBFS from the Summary block of the EBU R128 report. Rejects:");
bullet("Near-silence signals (integrated LUFS < -55) — copied carrier tracks or empty submissions");
bullet("Artificially maxed signals (peak dBFS > -0.5) — ripped/clipped commercial masters");
bullet("Single-frequency test tones — bot-generated submissions");
heading("Tier 3 — Digital Assertion Signature (Author Warrant)");
body("Requires an explicit machine-readable copyright ownership assertion (author_assertion: true) in every ingest request. This field is included in the forensic certificate as a signed warrant. Absent the warrant, the server returns HTTP 422 ERR_COPYRIGHT_WARRANT_REQUIRED before any processing occurs.");

// ── Section 3 ──
section("3", "Court-Admissible Forensic Chain-of-Title");
heading("Dual-Anchor Split-Key Architecture");
body("MLK V3.5 uses a nominator/denominator split: the two halves of the cryptographic proof are stored separately, making verification server-authoritative by design.");
bullet("Anchor A (Nominator) — embedded into the audio's least-significant bits. Encodes: SHA-256(contentHash | artistHandle | certId), truncated to 32 hex chars. Survives lossless export (WAV, AIFF, FLAC). Metadata-independent — travels with the signal, not the container.");
bullet("Anchor B (Denominator) — stored exclusively on GravelKing servers. Never transmitted to any client. The server-side complement required to reconstruct and verify the full handshake.");
bullet("HMAC-SHA256 Handshake — HMAC(SESSION_SECRET, certId | nominator | denominator). Tamper-evident binding between the in-signal anchor and the server record.");
heading("Verification Protocol");
body("POST /api/kernel/verify-signal accepts any WAV file and returns a structured VerifyResult: { warrant, anchorA, anchorB, hmac, certId, artist, certifiedAt }. Warrant status is one of:");
bullet("INTACT — Both anchors present, HMAC matches, content hash reconstructs correctly");
bullet("TAMPERED — Anchor A present, but Anchor B missing, HMAC mismatches, or content hash drift detected. Triggers Default of Warrant in downstream legal proceedings.");
bullet("NO_WATERMARK — No GravelKing LSB signature detected. Track was not issued by this platform.");
heading("Legal Standards Met");
bullet("FRE Rule 901(b)(9) — SHA-256 content fingerprint satisfies federal digital evidence authentication");
bullet("Thaler v. Vidal (2023) — Human authorship score >= 25% threshold for copyright assertability");
bullet("Dual-storage (PostgreSQL + Google Firestore) prevents spoliation objections");
bullet("ISO-8601 UTC certifiedAt timestamp predates any third-party claim");

// ── Section 4 ──
section("4", "B2B Platform Integration Model");
body("GravelKing Pro is designed for direct API integration by creator economy platforms, DSPs, and brand-content marketplaces. The integration surface is a RESTful JSON API with multipart/form-data ingest.");
heading("Core Endpoints");
bullet("POST /api/v1/ingest (alias: /api/kernel/master) — Submit WAV/FLAC/AIFF/MP3/AAC for MLK V3.5 processing + cert embedding. Returns processed audio stream + X-GK-CertId response header.");
bullet("POST /api/v1/verify (alias: /api/kernel/verify-signal) — Public clean-room verification. No auth required. Returns full VerifyResult JSON. < 2ms median response for pre-certified tracks.");
bullet("GET  /api/court-cert/:certId — Retrieve structured forensic certificate JSON.");
bullet("GET  /api/court-cert/:certId.pdf — Download court-ready PDF certificate.");
bullet("POST /api/v1/lead-capture — Enterprise partner onboarding. Issues 7-day demo API key + access to full endpoint surface.");
bullet("GET  /api/v1/whitepaper-spec — Structured JSON data model of this document for programmatic partner integration.");
heading("Supported Media Formats");
bullet("Lossless: WAV (PCM 16/24/32-bit), FLAC, AIFF — LSB embedding fully preserved");
bullet("Lossy (ingest-only): MP3, AAC, OGG, Opus, M4A — auto-converted to WAV pre-embedding");
bullet("Video containers (audio extraction): MP4, MOV, MKV, WebM — ffmpeg audio strip on arrival");
bullet("Sample rates: 44.1 kHz, 48 kHz, 96 kHz — all supported via ffmpeg normalization");
heading("Integration Flow for Creator Platforms");
body("1. Platform calls POST /api/v1/ingest with creator's audio file + author_assertion: true\n2. MLK V3.5 validates through 3-tier ingestion filter\n3. If cleared: applies mastering chain, embeds Anchor A LSB watermark, stores Anchor B + cert in DB\n4. Returns processed audio to platform + certId header\n5. Platform stores certId against creator's content record\n6. Any downstream dispute: platform or rights-holder calls POST /api/v1/verify with the distributed file — GravelKing returns warrant status in < 2ms");
heading("Throughput & SLA");
bullet("Median verification latency: < 2ms (pre-certified tracks, in-region)");
bullet("Mastering + embedding: 8-45 seconds per track depending on duration and format");
bullet("Concurrency: horizontal Docker scaling, up to 12 parallel processing lanes per node");
bullet("Webhook delivery for async cert events: configurable per API key");

// ── Section 5 ──
section("5", "Containerized Infrastructure Moat");
body("The MLK V3.5 kernel is implemented as a native C-bound DSP pipeline exposed through a Node.js FFI layer. The architecture is designed for zero-trust enterprise cloud deployment and on-premise air-gapped installations.");
heading("Core Architecture");
bullet("Docker multi-stage build: Node.js 22 LTS + ffmpeg-headless + native kernel binary");
bullet("mmap() for zero-copy audio buffer access — no heap allocation for signal processing");
bullet("mlockall(MCL_CURRENT | MCL_FUTURE) — pins kernel pages, prevents swap exposure of in-memory cert material");
bullet("Process isolation: each ingest request runs in a sandboxed child process with resource limits");
bullet("Zero secrets in Docker image — all credentials injected via runtime environment or Replit connector proxy");
heading("Deployment Targets");
bullet("SaaS (gravelkingpro.it.com) — immediate access, usage-based billing, Replit managed infrastructure");
bullet("AWS ECS / GCP Cloud Run — container registry publish, auto-scale on CPU, 99.9% SLA");
bullet("On-premise Docker Compose — air-gapped for major labels and studios, no data egress required");
bullet("White-label API — custom subdomain, volume pricing, dedicated webhook endpoints, custom branding");
heading("Security Posture");
bullet("SESSION_SECRET-derived HMAC — never stored in application code or Docker image");
bullet("All credentials via runtime secret injection only");
bullet("Database dual-write: PostgreSQL (queryable) + Google Firestore (append-only, immutable audit trail)");
bullet("Admin endpoints require separate ADMIN_KEY header — never exposed on public routes");
bullet("No telemetry to third parties — all processing is on-instance");

// ── Contact page ──
addPage();
doc.setFillColor(9, 9, 11);
doc.rect(0, 0, W, 297, "F");
doc.setFontSize(22);
doc.setTextColor(240, 240, 240);
doc.setFont("helvetica", "bold");
doc.text("Ready to integrate?", W / 2, 80, { align: "center" });
doc.setFontSize(11);
doc.setTextColor(161, 161, 170);
doc.setFont("helvetica", "normal");
doc.text("Start with the public verification demo, then request enterprise API access.", W / 2, 92, { align: "center" });
doc.setDrawColor(201, 162, 39);
doc.setLineWidth(0.4);
doc.line(marginL, 100, marginR, 100);
const contacts = [
  ["Demo Lab", "gravelkingpro.it.com/verify"],
  ["Enterprise Contact", "kevm@gravelkingpro.it.com"],
  ["Technical Brief", "gravelkingpro.it.com/whitepaper"],
  ["API Spec (JSON)", "gravelkingpro.it.com/api/v1/whitepaper-spec"],
];
y = 116;
contacts.forEach(([label, val]) => {
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text(label, marginL, y);
  doc.setTextColor(201, 162, 39);
  doc.text(val, marginL + 52, y);
  y += 10;
});
doc.setFontSize(9);
doc.setTextColor(113, 113, 122);
doc.text("All N One LLC  ·  GravelKing Productions  ·  © 2026", W / 2, 270, { align: "center" });
doc.text("CONFIDENTIAL — For authorized enterprise evaluation only.", W / 2, 277, { align: "center" });

const out = process.argv[2] ?? "GravelKingPro-MLKv35-Technical-Brief.pdf";
writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
console.log(`wrote ${out}`);
