import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download, CheckCircle2, Lock, Zap, Globe, Server, Wifi,
  Package, Shield, Monitor, ExternalLink, FileText, Film,
} from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/download";
import { usePlanPrices } from "@/lib/usePlanPrices";

const FREE_LOCAL = [
  "Noise reduction (Denoise)",
  "Voice Changer — 5 effects",
  "30-second Mastering preview (all presets)",
  "GravelKing Beat Maker — 30s clips",
  "Songwriter — full lyric generator",
];

const PRO_ONLINE = [
  "Full-length Mastering download (Pro)",
  "Full Beat Maker — up to 120s (Pro)",
  "Mix Studio — multi-track (Pro)",
  "Kernel Dashboard + PDF reports (Pro)",
  "Node Auditor — remote kernel (Node Auditor)",
];

const SYSTEM_REQ = [
  { label: "OS", value: "Windows 10+, macOS 12+, Ubuntu 20+" },
  { label: "Node.js", value: "v20 or later" },
  { label: "ffmpeg", value: "v6+ (required for audio processing)" },
  { label: "Internet", value: "Required for upgrades + paid features" },
  { label: "Disk", value: "~50 MB" },
];

export default function DownloadPage() {
  const { toast } = useToast();
  const planPrices = usePlanPrices();

  const handleDownload = async () => {
    try {
      const response = await fetch("/api/download/package");
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      downloadBlob(blob, "GravelKingProductions_Free_Setup.txt");
      toast({ title: "Download started", description: "Check your downloads folder." });
    } catch {
      toast({ title: "Error", description: "Could not prepare download.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">

        {/* Hero */}
        <div className="text-center space-y-4 pt-2">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-emerald-400">
            <Package className="w-3.5 h-3.5" /> GravelKing Productions — Free Edition
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Download <span className="text-amber-500">GravelKing</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Run GravelKing Productions locally — free features work on your machine with ffmpeg. Sign in to upgrade and unlock paid processing on our servers.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={handleDownload} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12 px-8 text-base">
              <Download className="w-5 h-5 mr-2" /> Download Free — v1.0
            </Button>
            <a href="https://gravelkingpro.it.com" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-12 px-6 border-border/40">
                <Globe className="w-4 h-4 mr-2" /> Web Version <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground">Free forever · No credit card · Open upgrade path</p>
        </div>

        {/* Architecture explanation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Runs Locally — Free</span>
              </div>
              <p className="text-xs text-muted-foreground">These features run entirely on your machine using ffmpeg. No internet required once installed.</p>
              <ul className="space-y-2">
                {FREE_LOCAL.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-amber-400">Connects Online — Paid</span>
              </div>
              <p className="text-xs text-muted-foreground">Paid features route to <strong>gravelkingpro.it.com</strong> servers. Upgrade flows open in your browser.</p>
              <ul className="space-y-2">
                {PRO_ONLINE.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* How it works */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-base">How It Works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  step: "1",
                  icon: <Download className="w-5 h-5 text-amber-500" />,
                  title: "Download & Install",
                  desc: "Download the setup file, install Node.js and ffmpeg, run the startup script.",
                },
                {
                  step: "2",
                  icon: <Server className="w-5 h-5 text-emerald-400" />,
                  title: "Free Features — Local",
                  desc: "Denoise, Voice Changer, Songwriter, and 30s Beat Maker run entirely on your machine.",
                },
                {
                  step: "3",
                  icon: <Wifi className="w-5 h-5 text-sky-400" />,
                  title: "Upgrade Online",
                  desc: "Click any Pro feature to open gravelkingpro.it.com for account setup and paid processing.",
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center shrink-0 text-sm font-bold text-amber-500">
                    {s.step}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {s.icon}
                      <span className="text-sm font-medium">{s.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System requirements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/40 bg-card/40">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" /> System Requirements
              </h3>
              <div className="space-y-2">
                {SYSTEM_REQ.map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                    <span className="text-xs text-muted-foreground">{r.label}</span>
                    <span className="text-xs font-medium">{r.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/40">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Upgrade Anytime
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The free download connects to <strong className="text-foreground">gravelkingpro.it.com</strong> for authentication and upgrades. Purchasing any paid plan unlocks additional processing via our servers — your local install automatically detects the upgrade.
              </p>
              <div className="space-y-2">
                {[
                  { name: "GravelKing Weekly", price: planPrices.weekly.label, color: "text-emerald-400" },
                  { name: "GravelKing Pro Plus", price: planPrices.monthly.label, color: "text-amber-400" },
                  { name: "Node Auditor", price: planPrices.node_auditor.label, color: "text-purple-400" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 border border-border/30">
                    <span className={`text-xs font-medium ${p.color}`}>{p.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.price}</Badge>
                  </div>
                ))}
              </div>
              <Link href="/pricing">
                <Button variant="outline" size="sm" className="w-full text-xs border-amber-500/30 text-amber-400">
                  View Full Pricing <ExternalLink className="w-3 h-3 ml-1.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Commercial Downloads — PDFs & Assets */}
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" /> Commercial Documents &amp; Assets
            </h3>
            <p className="text-xs text-muted-foreground">
              Official GravelKing Pro publications — free to download, share, and distribute.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  title: "MLK v3 White Paper",
                  desc: "6-page technical document. Brand story, engine architecture, real benchmark numbers.",
                  file: "GravelKingPro_MLKv3_WhitePaper.pdf",
                  icon: <FileText className="w-5 h-5 text-amber-400" />,
                  badge: "6 pages",
                },
                {
                  title: "MLK v3 Pitch Deck",
                  desc: "7-slide investor/partner deck. Problem, solution, numbers, product suite, opportunity.",
                  file: "GravelKingPro_MLKv3_PitchDeck.pdf",
                  icon: <Film className="w-5 h-5 text-amber-400" />,
                  badge: "7 slides",
                },
              ].map((doc) => (
                <div
                  key={doc.file}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-amber-500/20 bg-card/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      {doc.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{doc.title}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">
                          {doc.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{doc.desc}</p>
                    </div>
                  </div>
                  <a href={`/${doc.file}`} download>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GravelKing Productions · All N One LLC ·{" "}
          <a href="mailto:kevm@gravelkingpro.it.com" className="text-amber-500 hover:text-amber-400 underline">kevm@gravelkingpro.it.com</a>
        </p>

      </motion.div>
    </Layout>
  );
}
