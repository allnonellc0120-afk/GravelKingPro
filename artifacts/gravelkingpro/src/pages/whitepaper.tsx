import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { FileText, Shield, Lock, Key, Fingerprint, Server, Building2, CheckCircle2, Download } from "lucide-react";
import { LeadCaptureModal } from "@/components/lead-capture-modal";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SECTIONS = [
  {
    icon: <Shield className="w-5 h-5 text-amber-400" />,
    title: "Executive Summary",
    content: `GravelKing Pro (MLK V3.5) is a server-authoritative audio IP protection platform built for publishers, A&Rs, and music-tech platforms operating in the AI-era content landscape.

The platform solves the metadata loophole: today, any streamed or distributed audio track can have its ID3 metadata stripped, reassigned, or fraudulently claimed. GravelKing Pro embeds proof of ownership directly into the audio signal at the bit level — making tampering detectable and chain-of-custody verification server-authoritative.`,
  },
  {
    icon: <Fingerprint className="w-5 h-5 text-amber-400" />,
    title: "Core Technology: LSB Dual-Anchor Steganography",
    content: `MLK V3.5 employs a dual-anchor split-key architecture:

Anchor A (Nominator) — embedded into the audio's least-significant bits
  • SHA-256 hash slice of: contentHash | artistHandle | certId
  • Survives lossless export and WAV archival
  • Travels with the track forever — metadata-independent

Anchor B (Denominator) — held exclusively on GravelKing servers
  • Server-side complement to the nominator
  • HMAC-SHA256 handshake signed with a per-deployment secret
  • Never transmitted to any client

Verification requires BOTH anchors. Without the server denominator, a discovered nominator proves nothing. This is legally equivalent to a two-factor notarisation.`,
  },
  {
    icon: <Key className="w-5 h-5 text-amber-400" />,
    title: "Chain-of-Custody Certificate",
    content: `Every certified master generates a forensic certificate containing:
  • ISO-8601 UTC timestamp (certifiedAt)
  • SHA-256 hash of the pre-MLK audio content (content integrity)
  • SHA-256 hash of the artist's style prompt (creative authorship evidence)
  • Dual-anchor HMAC proof (tamper-evident binding)
  • Style authorship score 0–100 (human-contribution quantification)

Certificates are dual-stored: PostgreSQL (live, queryable) and Google Firestore (immutable append-only backup). Dual storage prevents unilateral deletion and creates an independent audit trail.`,
  },
  {
    icon: <Lock className="w-5 h-5 text-amber-400" />,
    title: "Compliance & Legal Context",
    content: `• Consistent with U.S. Copyright Office guidance (Thaler v. Vidal, 2023)
• Human-authorship score threshold: ≥ 25% for copyright assertability under current guidance
• SHA-256 content fingerprint satisfies FRE Rule 901(b)(9) digital evidence authentication
• HMAC-SHA256 handshake constitutes server-authoritative digital evidence
• Dual-storage architecture prevents spoliation objections
• Artist: certifiedAt timestamp is legally relevant — predates any third-party claim`,
  },
  {
    icon: <Server className="w-5 h-5 text-amber-400" />,
    title: "API Integration Reference",
    content: `POST /api/kernel/master
  Apply MLK V3.5 mastering chain + embed cert into audio signal.

POST /api/kernel/verify-signal
  Public clean-room verification. No auth required.
  Returns Anchor A, Anchor B, HMAC, and Warrant status.

GET /api/court-cert/:certId
  JSON forensic certificate for a completed master.

GET /api/court-cert/:certId.pdf
  PDF forensic certificate (downloadable).

POST /api/v1/lead-capture
  Enterprise partner onboarding — issues 7-day demo API key.`,
  },
  {
    icon: <Building2 className="w-5 h-5 text-amber-400" />,
    title: "Enterprise Licensing",
    content: `GravelKing Pro is available as:

  SaaS — gravelkingpro.it.com — immediate access, usage-based billing
  White-label API — custom subdomain, volume pricing, dedicated webhook endpoints
  On-premise Docker — air-gapped for major labels and studios

Contact: kevm@gravelkingpro.it.com
Demo Lab: gravelkingpro.it.com/verify

All N One LLC — GravelKing Productions`,
  },
];

export default function WhitepaperPage() {
  const [leadModalOpen, setLeadModalOpen] = useState(false);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-12 pb-16">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pt-2">
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs gap-1.5 px-3 py-1">
            <FileText className="w-3.5 h-3.5" /> Technical Brief
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight leading-snug">
            GravelKing Pro MLK V3.5<br />
            <span className="text-amber-500">Signal-Level Audio Security</span>
          </h1>
          <p className="text-muted-foreground text-base max-w-xl">
            Enterprise audio steganography, dual-anchor cryptographic verification, and signal-level asset protection for publishers, A&Rs, and music tech platforms.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href={`${BASE}/api/whitepaper.pdf`}
              download="GravelKingPro-MLKv35-Technical-Brief.pdf"
            >
              <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2">
                <Download className="w-4 h-4" /> Download PDF
              </Button>
            </a>
            <Button
              variant="outline"
              onClick={() => setLeadModalOpen(true)}
              className="border-border/50 gap-2"
            >
              <Building2 className="w-4 h-4" /> Request Enterprise Demo
            </Button>
          </div>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.1 } }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {[
            { label: "LSB Steganography", sub: "Signal-level" },
            { label: "Dual-Anchor", sub: "Split-key cert" },
            { label: "HMAC-SHA256", sub: "Tamper-evident" },
            { label: "FRE 901(b)(9)", sub: "Court-admissible" },
          ].map(({ label, sub }) => (
            <div key={label} className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-foreground/90">{label}</p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </motion.div>

        {/* Content sections */}
        <div className="space-y-8">
          {SECTIONS.map(({ icon, title, content }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.06 } }}
              className="space-y-3"
            >
              <h2 className="font-bold text-lg flex items-center gap-2">
                {icon} {title}
              </h2>
              <div className="border-l-2 border-amber-500/30 pl-5">
                <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
                  {content}
                </pre>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.5 } }}
          className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-8 text-center space-y-4"
        >
          <Shield className="w-10 h-10 text-amber-400 mx-auto" />
          <h3 className="text-xl font-bold">Ready to protect your catalog?</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Start with the live verification demo, then request enterprise pricing for label-wide deployment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <a href="/verify">
              <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2">
                <Fingerprint className="w-4 h-4" /> Try Verification Lab
              </Button>
            </a>
            <Button
              onClick={() => setLeadModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
            >
              <Building2 className="w-4 h-4" /> Request Enterprise Demo
            </Button>
          </div>
        </motion.div>

      </div>

      <LeadCaptureModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
      />
    </Layout>
  );
}
