import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useAppState } from "@/lib/context";
import {
  Shield, FileCode2, CheckCircle2, Lock, Crown, ArrowRight,
  Music, Edit3, Share2, Star, Zap, Globe, FileText, HelpCircle,
  ChevronRight, Mic2,
} from "lucide-react";

const HOW_IT_WORKS = [
  {
    n: "1",
    icon: <Edit3 className="w-5 h-5 text-amber-400" />,
    title: "Write your song with AI",
    body: "Use the Songwriting Studio to generate lyrics from your story, genre, and vibe. The AI draft is the starting point — not the finish line.",
  },
  {
    n: "2",
    icon: <Music className="w-5 h-5 text-emerald-400" />,
    title: "Edit until your authorship score hits 25%+",
    body: "Every line you change is tracked forensically by the authorship ledger. Once 25% of the lyrics are measurably yours, copyright protection kicks in under U.S. law.",
  },
  {
    n: "3",
    icon: <FileCode2 className="w-5 h-5 text-sky-400" />,
    title: "Get your embed code",
    body: "Hit 'Get Embed Code' and receive a hashed certificate widget — a real <iframe> you can paste into your website, SoundCloud bio, Instagram link-in-bio, or press kit. Anyone who opens it sees your certified authorship proof instantly.",
  },
];

const WHY_MATTERS = [
  {
    icon: <Globe className="w-5 h-5 text-sky-400" />,
    title: "AI-era copyright is real",
    body: "The U.S. Copyright Office (Thaler v. Vidal, 2023) confirmed: human-edited AI output is protectable. Your edits are what make the difference. We track every single one.",
  },
  {
    icon: <Star className="w-5 h-5 text-amber-400" />,
    title: "Labels & publishers ask for proof now",
    body: "A1s, music supervisors, and sync licensing teams are starting to ask: 'Can you verify this is yours?' The embed code is your answer — visible, verifiable, timestamped.",
  },
  {
    icon: <Share2 className="w-5 h-5 text-emerald-400" />,
    title: "Share it anywhere",
    body: "It's an iframe — it works on Linktree, your personal website, press kits, YouTube descriptions, or anywhere you can paste HTML. No login required to view it.",
  },
  {
    icon: <Shield className="w-5 h-5 text-purple-400" />,
    title: "The fingerprint is tamper-evident",
    body: "The embed token is an HMAC-SHA256 fingerprint tied to your project ID and authorship score. Change the score or fake the ID and the certificate page refuses to load.",
  },
];

const FAQ = [
  {
    q: "Does this actually give me legal copyright?",
    a: "The certificate documents that you made sufficient human creative contributions to assert ownership, consistent with current U.S. Copyright Office guidance. It is not a registered copyright filing — but it is strong, forensic evidence if a dispute ever arises. For formal registration, take the certificate to copyright.gov.",
  },
  {
    q: "What if someone copies my embed code?",
    a: "The token is tied to your project ID + your exact authorship score. Anyone who tries to use your token with a different project or score gets an error page. The fingerprint can't be faked without your server-side session.",
  },
  {
    q: "Can I update the embed code after editing more?",
    a: "Yes. If your authorship score increases and you certify again, you get a new token. We recommend regenerating and updating your embed whenever you make significant edits.",
  },
  {
    q: "Does it work without Pro?",
    a: "Generation is free. Editing your lines, reaching 25%, and getting the embed code all require a GravelKing Pro subscription ($39.99/mo) — that's where the forensic authorship ledger lives.",
  },
  {
    q: "What does the embed code look like on my website?",
    a: "It's an iframe showing your certificate: a gold-bordered card with the song title, your authorship score, the certification date, and the tamper-evident fingerprint. Clean and professional on any background.",
  },
];

export default function PitchPage() {
  const { isPro } = useAppState();

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-14">

        {/* ── HERO ── */}
        <div className="text-center space-y-5 pt-4">
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs gap-1.5 px-3 py-1">
            <Shield className="w-3.5 h-3.5" /> IP Certification · Pro Feature
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight leading-snug">
            Your music is everywhere.<br />
            <span className="text-amber-500">Can you prove it's yours?</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            GravelKing tracks every edit you make to AI-assisted lyrics and certifies your human authorship — with a real, verifiable embed code you can put anywhere.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            {isPro ? (
              <Link href="/songwriting">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11 px-8">
                  <FileCode2 className="w-4 h-4 mr-2" /> Open Songwriting Studio
                </Button>
              </Link>
            ) : (
              <Link href="/pricing">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11 px-8">
                  <Crown className="w-4 h-4 mr-2" /> Get Pro — Unlock IP Embed
                </Button>
              </Link>
            )}
            <Link href="/songwriting">
              <Button variant="outline" className="h-11 px-6 border-border/50">
                Try Songwriting Studio free <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          {!isPro && (
            <p className="text-xs text-muted-foreground">
              Generation is free · Embed code requires <span className="text-amber-400 font-medium">King ($24.99/mo)</span>
            </p>
          )}
        </div>

        {/* ── DEMO CERTIFICATE PREVIEW ── */}
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-xl border-4 border-double border-amber-500/60 bg-amber-950/10 p-8 text-center shadow-lg shadow-amber-500/5 space-y-4">
            <p className="text-[10px] font-bold tracking-[4px] uppercase text-amber-500">Gravel King Productions · Engine 2 IP Pipeline</p>
            <h3 className="text-lg font-bold text-foreground/90">Certificate of Human–AI Collaborative Authorship</h3>
            <div className="inline-flex items-center gap-2 border-2 border-emerald-500 text-emerald-400 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wide">
              <CheckCircle2 className="w-3.5 h-3.5" /> Certified Human-AI Collaborative Work
            </div>
            <div>
              <p className="text-lg italic text-foreground/70">"Midnight in the Gravel Rain"</p>
              <p className="text-xs text-muted-foreground mt-1">Genre: Hip-Hop · June 2026</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">Human Authorship Score: 72%</p>
            <p className="text-[10px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Verified by forensic authorship ledger — every edit timestamped and stored.
            </p>
            <div className="bg-amber-950/30 border border-amber-500/30 rounded px-3 py-2 inline-block">
              <p className="font-mono text-xs text-amber-400/70 tracking-widest">GKP-A3F29D1C-7B84E510</p>
            </div>
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/30" />
            <h2 className="text-xl font-bold whitespace-nowrap">How it works</h2>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <div className="space-y-4">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Card className="border-border/40 bg-card/40">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="w-9 h-9 rounded-full bg-secondary/60 border border-border/40 flex items-center justify-center shrink-0">
                      {step.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Step {step.n}</span>
                      </div>
                      <p className="font-semibold text-sm mb-1">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── WHY IT MATTERS ── */}
        <div className="space-y-5">
          <h2 className="text-xl font-bold">Why creators need this now</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {WHY_MATTERS.map((item) => (
              <Card key={item.title} className="border-border/40 bg-card/30">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="font-semibold text-sm">{item.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── EMBED CODE EXPLAINER ── */}
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold">The embed code</h2>
            <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400">iframe widget</Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            After certifying, you get a snippet of HTML you can paste anywhere — your own website, Linktree, SoundCloud bio, or a digital press kit. No login is required for viewers.
          </p>
          <pre className="rounded-lg bg-background/80 border border-border/50 p-3 text-xs font-mono text-muted-foreground overflow-x-auto">
{`<iframe
  src="https://gravelkingpro.com/api/lyrics/embed/your-project-id?token=TOKEN"
  width="600" height="400"
  frameborder="0"
  title="IP Certificate"
  style="border-radius:8px;border:1px solid #c9a227;max-width:100%"
></iframe>`}
          </pre>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>The token is HMAC-SHA256 signed — if someone changes any part of the URL, the certificate page shows an error. Your proof can't be spoofed.</span>
          </div>
        </div>

        {/* ── UPGRADE CTA (non-Pro) ── */}
        {!isPro && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-7 text-center space-y-4">
            <Crown className="w-8 h-8 text-amber-400 mx-auto" />
            <h2 className="text-xl font-bold">Get your embed code today</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              The Songwriting Studio's forensic ledger, authorship score, and embed code are all included in GravelKing Pro.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/pricing">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11 px-8">
                  <Crown className="w-4 h-4 mr-2" /> Get GravelKing Pro
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/songwriting">
                <Button variant="outline" className="h-11 px-6">
                  Try writing free first
                </Button>
              </Link>
            </div>
            <p className="text-[10px] text-muted-foreground">$39.99/mo · cancel anytime · 1 free master included on signup</p>
          </div>
        )}

        {/* ── Pro CTA ── */}
        {isPro && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-bold text-emerald-400">You have access — go create</h2>
            <p className="text-sm text-muted-foreground">Open the Songwriting Studio, build your song, hit 25% authorship, and generate your embed code.</p>
            <Link href="/songwriting">
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold h-10 px-7">
                <Mic2 className="w-4 h-4 mr-2" /> Open Songwriting Studio
              </Button>
            </Link>
          </div>
        )}

        {/* ── FAQ ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-bold">Frequently asked</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-1.5">
                <p className="text-sm font-semibold">{item.q}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer links ── */}
        <div className="flex items-center justify-center gap-6 pb-8 text-xs text-muted-foreground flex-wrap">
          <Link href="/songwriting" className="hover:text-amber-400 transition-colors flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Songwriting Studio
          </Link>
          <Link href="/pricing" className="hover:text-amber-400 transition-colors flex items-center gap-1">
            <Crown className="w-3.5 h-3.5" /> Pricing
          </Link>
          <Link href="/contact" className="hover:text-amber-400 transition-colors flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> Contact
          </Link>
        </div>

      </motion.div>
    </Layout>
  );
}
