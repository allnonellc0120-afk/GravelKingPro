import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Shield, Lock, Key, Fingerprint, Server, Building2,
  CheckCircle2, Download, XCircle, AlertTriangle, Zap,
  FileText, Database, Globe, Code2, ArrowRight,
} from "lucide-react";
import { LeadCaptureModal } from "@/components/lead-capture-modal";
import { useState } from "react";
import { downloadUrl } from "@/lib/download";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── PDF download ──────────────────────────────────────────────────────────────
// Streams the server-generated Technical Brief (single source of truth) from
// GET /api/v1/download-whitepaper — large print-legible typography, served
// with a Content-Disposition: attachment header.
function downloadPDF() {
  downloadUrl(`${BASE}/api/v1/download-whitepaper`, "GravelKingPro-MLKv35-Technical-Brief.pdf");
}

// ── Comparison table data ─────────────────────────────────────────────────────
const COMPARISON = [
  { feature: "Survives re-encoding / platform distribution", metadata: false, blockchain: false, mlk: true },
  { feature: "Signal-level (metadata-independent)", metadata: false, blockchain: false, mlk: true },
  { feature: "Server-authoritative verification", metadata: false, blockchain: "partial", mlk: true },
  { feature: "Court-admissible under FRE 901(b)(9)", metadata: "partial", blockchain: "partial", mlk: true },
  { feature: "Tamper detection (post-cert alteration)", metadata: false, blockchain: false, mlk: true },
  { feature: "< 2ms real-time verification", metadata: true, blockchain: false, mlk: true },
  { feature: "AI-generated content gating", metadata: false, blockchain: false, mlk: true },
  { feature: "No third-party dependency at verify time", metadata: true, blockchain: false, mlk: true },
  { feature: "On-premise / air-gapped deployment", metadata: true, blockchain: false, mlk: true },
];

function Cell({ val }: { val: boolean | string }) {
  if (val === true) return <div className="flex justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></div>;
  if (val === false) return <div className="flex justify-center"><XCircle className="w-4 h-4 text-red-500/60" /></div>;
  return <div className="flex justify-center"><AlertTriangle className="w-3.5 h-3.5 text-amber-500/70" /></div>;
}

// ── Architecture diagram ──────────────────────────────────────────────────────
function ArchDiagram() {
  const nodes = [
    { label: "Creator / Platform", sub: "WAV · FLAC · AIFF · MP3", icon: <Globe className="w-5 h-5 text-cyan-400" />, color: "border-cyan-500/30 bg-cyan-950/20" },
    { label: "3-Tier Ingestion", sub: "Metadata · Spectral · Warrant", icon: <Shield className="w-5 h-5 text-amber-400" />, color: "border-amber-500/30 bg-amber-950/20" },
    { label: "MLK V3.5 Engine", sub: "LSB embed · Mastering chain", icon: <Zap className="w-5 h-5 text-violet-400" />, color: "border-violet-500/30 bg-violet-950/20" },
    { label: "Cert Dual-Store", sub: "PostgreSQL · Firestore", icon: <Database className="w-5 h-5 text-emerald-400" />, color: "border-emerald-500/30 bg-emerald-950/20" },
  ];

  const anchors = [
    { label: "Anchor A", sub: "Embedded in signal (LSB)", icon: <Fingerprint className="w-4 h-4 text-amber-400" /> },
    { label: "Anchor B", sub: "Server-only (never transmitted)", icon: <Lock className="w-4 h-4 text-red-400" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0">
        {nodes.map((n, i) => (
          <div key={n.label} className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <div className={`flex-1 rounded-lg border ${n.color} p-4 text-center space-y-1`}>
              <div className="flex justify-center mb-1">{n.icon}</div>
              <p className="text-xs font-bold text-foreground/90">{n.label}</p>
              <p className="text-[10px] text-muted-foreground">{n.sub}</p>
            </div>
            {i < nodes.length - 1 && (
              <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0 hidden sm:block" />
            )}
          </div>
        ))}
      </div>

      {/* Split → Anchors */}
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        {anchors.map((a) => (
          <div key={a.label} className="flex-1 rounded-lg border border-border/20 bg-muted/5 p-4 flex items-center gap-3">
            <div className="shrink-0">{a.icon}</div>
            <div>
              <p className="text-xs font-bold text-foreground/90">{a.label}</p>
              <p className="text-[10px] text-muted-foreground">{a.sub}</p>
            </div>
          </div>
        ))}
        <div className="flex-1 rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-4 flex items-center gap-3">
          <Key className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <p className="text-xs font-bold text-foreground/90">HMAC Handshake</p>
            <p className="text-[10px] text-muted-foreground">SHA-256 binding · tamper-evident</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-bold text-foreground/90">Verification result: WARRANT INTACT / TAMPERED / NO_WATERMARK</p>
          <p className="text-xs text-muted-foreground">POST /api/v1/verify — public endpoint · no auth required · &lt; 2ms median</p>
        </div>
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    num: "01",
    icon: <Shield className="w-5 h-5 text-cyan-400" />,
    title: "Executive Summary & Market Imperative",
    sub: "2026 AI landscape — from passive ledgers to active signal-level protection",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          The 2026 AI content landscape has created an urgent trust deficit for digital creators. Generative AI tools
          now produce audio indistinguishable from human-authored recordings, AI training datasets ingest unlicensed
          catalog without attribution, and platform-level metadata — ID3 tags, ISRC codes — can be stripped,
          reassigned, or fraudulently claimed by any actor with basic tooling.
        </p>
        <p>
          <span className="text-cyan-400 font-semibold">GravelKing Pro MLK V3.5</span> solves this at the signal
          level — not the metadata level. Rather than relying on external ledgers, blockchain timestamps, or
          third-party registries that can be circumvented, MLK V3.5 embeds cryptographic proof of ownership directly
          into the audio bitstream using dual-anchor LSB steganography. This proof travels with the track
          permanently, survives platform distribution, and is verified server-authoritatively.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[
            { val: "$43B+", lbl: "Creator economy 2026" },
            { val: "EU AI Act", lbl: "Aug 2026 enforcement" },
            { val: "≥ 25%", lbl: "Human authorship threshold" },
            { val: "< 2ms", lbl: "Median verify latency" },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 text-center">
              <p className="text-base font-bold text-cyan-400">{val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{lbl}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "02",
    icon: <Shield className="w-5 h-5 text-amber-400" />,
    title: "Ingestion Defense & Bad-Actor Mitigation",
    sub: "3-tier validate_asset_ingestion pipeline — runs before any watermark is embedded",
    content: (
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <p>
          Every asset passes through a three-tier ingestion validation pipeline before any signal-level processing
          begins. This prevents adversarial actors from registering stolen, AI-generated, or commercially licensed
          content and receiving a fraudulent GravelKing certificate.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              tier: "Tier 1",
              title: "Metadata Collision Check",
              icon: <Database className="w-4 h-4 text-amber-400" />,
              items: ["ISRC / ISWC / UPC pattern scan", "Major label / DSP identifier detection", "Commercial artist name blacklist", "Returns 422 on any collision"],
            },
            {
              tier: "Tier 2",
              title: "Spectral Audio Fingerprinting",
              icon: <Fingerprint className="w-4 h-4 text-amber-400" />,
              items: ["ffmpeg ebur128 LUFS analysis", "Near-silence rejection (< −55 LUFS)", "Artificially clipped signal detection", "Single-frequency tone detection"],
            },
            {
              tier: "Tier 3",
              title: "Digital Assertion Signature",
              icon: <Key className="w-4 h-4 text-amber-400" />,
              items: ["author_assertion: true required", "Machine-readable copyright warrant", "Included in forensic certificate", "Absent → HTTP 422 ERR_WARRANT"],
            },
          ].map(({ tier, title, icon, items }) => (
            <div key={tier} className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                {icon}
                <div>
                  <p className="text-[10px] text-amber-500/70 font-semibold uppercase tracking-wider">{tier}</p>
                  <p className="text-xs font-bold text-foreground/90 leading-tight">{title}</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-[11px]">
                    <span className="text-amber-500 mt-0.5 shrink-0">›</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "03",
    icon: <Lock className="w-5 h-5 text-emerald-400" />,
    title: "Court-Admissible Forensic Chain-of-Title",
    sub: "Dual-anchor handshake — tampering triggers automatic Default of Warrant",
    content: (
      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <p>
          MLK V3.5 uses a nominator/denominator split: the two halves of the cryptographic proof are stored
          separately, making verification server-authoritative. A discovered Anchor A proves nothing without the
          server-held Anchor B — legally equivalent to a two-factor notarisation.
        </p>
        <ArchDiagram />
        <div className="grid sm:grid-cols-3 gap-4 pt-2">
          {[
            { label: "FRE Rule 901(b)(9)", desc: "SHA-256 fingerprint satisfies federal digital evidence authentication standard" },
            { label: "Thaler v. Vidal (2023)", desc: "Human authorship score ≥ 25% tracked per cert for copyright assertability" },
            { label: "Dual-store architecture", desc: "PostgreSQL + Firestore prevents spoliation objections in discovery" },
          ].map(({ label, desc }) => (
            <div key={label} className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-4">
              <p className="text-xs font-bold text-emerald-400 mb-1.5">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "04",
    icon: <Code2 className="w-5 h-5 text-violet-400" />,
    title: "B2B Platform Integration Model",
    sub: "REST API · creator ecosystems · PortalBunny-ready · < 2ms verify",
    content: (
      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <p>
          GravelKing Pro is built for direct API integration by creator economy platforms, DSPs, and brand-content
          marketplaces. The integration surface is a RESTful JSON API with multipart/form-data ingest and
          sub-2ms verification for pre-certified tracks.
        </p>

        {/* Endpoint table */}
        <div className="rounded-lg border border-border/30 overflow-hidden">
          <div className="bg-muted/10 px-4 py-2 border-b border-border/20 flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">API Endpoints</span>
          </div>
          <div className="divide-y divide-border/10">
            {[
              { method: "POST", path: "/api/v1/ingest", desc: "Submit audio for MLK V3.5 watermarking + mastering. Returns processed stream + X-GK-CertId header." },
              { method: "POST", path: "/api/v1/verify", desc: "Public clean-room verification. No auth. Returns VerifyResult JSON. < 2ms for pre-certified." },
              { method: "GET", path: "/api/court-cert/:certId", desc: "Retrieve structured forensic certificate JSON for a certId." },
              { method: "GET", path: "/api/court-cert/:certId.pdf", desc: "Download court-ready PDF certificate." },
              { method: "POST", path: "/api/v1/lead-capture", desc: "Enterprise partner onboarding. Issues 7-day demo API key + full endpoint access." },
              { method: "GET", path: "/api/v1/whitepaper-spec", desc: "Structured JSON data model of this document for programmatic partner integration." },
            ].map(({ method, path, desc }) => (
              <div key={path} className="flex items-start gap-3 px-4 py-3">
                <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded font-mono ${method === "GET" ? "bg-cyan-950/40 text-cyan-400 border border-cyan-500/20" : "bg-violet-950/40 text-violet-400 border border-violet-500/20"}`}>{method}</span>
                <code className="text-[11px] text-amber-400/90 font-mono shrink-0 pt-0.5">{path}</code>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Format support */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-4 space-y-2">
            <p className="text-xs font-bold text-violet-400">Supported Formats</p>
            {[
              ["Lossless (full LSB)", "WAV · FLAC · AIFF"],
              ["Lossy (auto-convert)", "MP3 · AAC · OGG · Opus · M4A"],
              ["Video containers", "MP4 · MOV · MKV · WebM"],
              ["Sample rates", "44.1 · 48 · 96 kHz"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-foreground/80 font-mono">{v}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-4 space-y-2">
            <p className="text-xs font-bold text-violet-400">Throughput & SLA</p>
            {[
              ["Verify latency (pre-cert)", "< 2ms median"],
              ["Mastering + embed", "8–45s per track"],
              ["Max file size", "200 MB per request"],
              ["Parallel processing", "Up to 12 lanes/node"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-foreground/80 font-mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    num: "05",
    icon: <Server className="w-5 h-5 text-cyan-400" />,
    title: "Containerized Infrastructure Moat",
    sub: "Docker · mmap · mlockall · zero-trust AWS/GCP/on-premise",
    content: (
      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <p>
          The MLK V3.5 kernel is a native C-bound DSP pipeline exposed through a Node.js FFI layer. The
          architecture is designed for zero-trust enterprise cloud deployment and on-premise air-gapped
          installations at major labels and studios.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { title: "Kernel Architecture", icon: <Server className="w-4 h-4 text-cyan-400" />, items: ["Node.js 22 LTS + ffmpeg-headless", "mmap() — zero-copy audio buffer access", "mlockall() — pins pages, prevents swap", "Per-request process isolation + resource limits", "Zero secrets in Docker image"] },
            { title: "Deployment Targets", icon: <Globe className="w-4 h-4 text-cyan-400" />, items: ["SaaS — gravelkingpro.it.com (immediate)", "AWS ECS / GCP Cloud Run (auto-scale)", "On-premise Docker Compose (air-gapped)", "White-label API (custom subdomain + branding)", "Webhook delivery for async cert events"] },
          ].map(({ title, icon, items }) => (
            <div key={title} className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                {icon}
                <p className="text-xs font-bold text-foreground/90">{title}</p>
              </div>
              <ul className="space-y-1.5">
                {items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-[11px]">
                    <span className="text-cyan-500 mt-0.5 shrink-0">›</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WhitepaperPage() {
  const [leadModalOpen, setLeadModalOpen] = useState(false);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-16 pb-20">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 pt-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-xs gap-1.5 px-3 py-1">
              <FileText className="w-3.5 h-3.5" /> Technical Brief — Enterprise Edition
            </Badge>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs gap-1.5 px-3 py-1">
              MLK V3.5 · 2026
            </Badge>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight">
            GravelKing Pro<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">
              Signal-Level Audio Security
            </span>
          </h1>

          <p className="text-muted-foreground text-base max-w-2xl leading-relaxed">
            Enterprise audio steganography, dual-anchor cryptographic verification, and AI-era IP governance
            for publishers, A&R departments, and creator-economy platforms. Built by All&nbsp;N&nbsp;One&nbsp;LLC.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              onClick={downloadPDF}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
            >
              <Download className="w-4 h-4" /> Download Technical Brief (PDF)
            </Button>
            <Button
              variant="outline"
              onClick={() => setLeadModalOpen(true)}
              className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 gap-2"
            >
              <Building2 className="w-4 h-4" /> Request Enterprise Demo
            </Button>
            <a href={`${BASE}/api/v1/whitepaper-spec`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground gap-2 text-sm">
                <Code2 className="w-4 h-4" /> JSON Spec
              </Button>
            </a>
          </div>
        </motion.div>

        {/* Comparison Matrix */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1 } }} className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Competitive Matrix</span>
            <div className="flex-1 h-px bg-border/30" />
          </div>
          <div className="rounded-xl border border-border/30 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 bg-muted/10">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-[46%]">Protection Feature</th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Metadata / ID3</th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Blockchain Timestamp</th>
                  <th className="text-center px-3 py-3 font-bold text-amber-400">MLK V3.5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {COMPARISON.map(({ feature, metadata, blockchain, mlk }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? "bg-muted/5" : ""}>
                    <td className="px-4 py-2.5 text-foreground/80">{feature}</td>
                    <td className="px-3 py-2.5"><Cell val={metadata} /></td>
                    <td className="px-3 py-2.5"><Cell val={blockchain} /></td>
                    <td className="px-3 py-2.5 bg-amber-500/5"><Cell val={mlk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border/20 bg-muted/5 flex gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Supported</span>
              <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500/60" /> Not supported</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500/70" /> Partial</span>
            </div>
          </div>
        </motion.div>

        {/* Sections */}
        <div className="space-y-12">
          {SECTIONS.map(({ num, icon, title, sub, content }, i) => (
            <motion.div
              key={num}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.07 } }}
              className="space-y-5"
            >
              <div className="flex items-start gap-4 pb-4 border-b border-border/20">
                <span className="text-2xl font-black text-muted-foreground/20 font-mono leading-none mt-1">{num}</span>
                <div className="space-y-1">
                  <h2 className="font-bold text-xl flex items-center gap-2.5">
                    {icon} {title}
                  </h2>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
              {content}
            </motion.div>
          ))}
        </div>

        {/* Footer CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.6 } }}
          className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 to-amber-950/10 p-10 text-center space-y-5"
        >
          <div className="flex justify-center gap-3">
            <Shield className="w-8 h-8 text-cyan-400" />
            <Fingerprint className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-2xl font-black">Ready to protect your creator catalog?</h3>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
            Start with the public verification demo — upload any GravelKing-certified WAV and see the dual-anchor
            verification live. Then request enterprise API access or a custom integration call.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <a href="/verify">
              <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2">
                <Fingerprint className="w-4 h-4" /> Try Verification Lab
              </Button>
            </a>
            <Button
              onClick={() => setLeadModalOpen(true)}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
            >
              <Building2 className="w-4 h-4" /> Request Enterprise Demo
            </Button>
            <Button onClick={downloadPDF} variant="outline" className="gap-2 text-muted-foreground">
              <Download className="w-4 h-4" /> Download PDF Brief
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            kevm@gravelkingpro.it.com · All N One LLC · GravelKing Productions
          </p>
        </motion.div>

      </div>

      <LeadCaptureModal open={leadModalOpen} onClose={() => setLeadModalOpen(false)} />
    </Layout>
  );
}
