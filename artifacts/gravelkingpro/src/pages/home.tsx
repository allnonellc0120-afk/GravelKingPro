import { useState, useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Wand2, Music2, FileCode2, PenLine, Activity, LayoutDashboard,
  Play, ChevronRight, CheckCircle2, Zap, Download, Mail, Bell,
  X, Crown, ShieldCheck, ArrowRight, Pause, Volume2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const AUDIO_TOOLS = [
  {
    icon: <Wand2 className="w-5 h-5 text-sky-400" />,
    title: "MLK v3 Mastering",
    description: "6 professional presets — Broadcast, Vinyl, Podcast, Club, Film, Normal. One click, studio-quality WAV output.",
    badge: "1 Free Master",
    badgeColor: "border-emerald-500/40 text-emerald-400",
    href: "/mastering",
    cta: "Master a track",
    color: "sky",
  },
  {
    icon: <Music2 className="w-5 h-5 text-amber-400" />,
    title: "Vocal Booth",
    description: "Sing over any backing track with karaoke-style lyric sync, teleprompter, and real-time vocal monitoring.",
    badge: "Studio",
    badgeColor: "border-amber-500/40 text-amber-400",
    href: "/vocal-booth",
    cta: "Open Booth",
    color: "amber",
  },
  {
    icon: <LayoutDashboard className="w-5 h-5 text-emerald-400" />,
    title: "Live Multitrack DAW",
    description: "Mix 8+ stems in real time with EQ, compression, reverb, and per-channel metering — all in the browser.",
    badge: "Pro",
    badgeColor: "border-amber-500/40 text-amber-400",
    href: "/studio",
    cta: "Open DAW",
    color: "emerald",
  },
  {
    icon: <PenLine className="w-5 h-5 text-violet-400" />,
    title: "Songwriting Studio",
    description: "Document your lyrics, co-writers, and creative timeline. Build an airtight authorship record for every song.",
    badge: "IP",
    badgeColor: "border-violet-500/40 text-violet-400",
    href: "/songwriting",
    cta: "Open Studio",
    color: "violet",
  },
];

const IP_TOOLS = [
  {
    icon: <PenLine className="w-5 h-5 text-violet-400" />,
    title: "Songwriting Studio",
    description: "Document your lyrics, co-writers, and creative timeline. Build an airtight record of authorship for every song.",
    href: "/songwriting",
    cta: "Open Studio",
  },
  {
    icon: <FileCode2 className="w-5 h-5 text-amber-400" />,
    title: "IP Embed Code",
    description: "Generate a certified authorship widget for your website, SoundCloud, or social bio that proves you created the track.",
    href: "/kernel",
    cta: "Get your embed",
  },
  {
    icon: <Activity className="w-5 h-5 text-emerald-400" />,
    title: "Kernel Dashboard",
    description: "Audio fingerprinting, before/after optimization telemetry, and a PDF-exportable report of your processing session.",
    href: "/kernel",
    cta: "View dashboard",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: null,
    color: "border-border/30",
    features: ["Mastering 30s preview", "Vocal Booth access", "Songwriting Studio (basic)"],
  },
  {
    name: "GravelKing Weekly",
    price: "$9.99",
    period: "/week",
    color: "border-emerald-500/30 bg-emerald-500/5",
    badge: "Flexible",
    badgeColor: "bg-emerald-500 text-black",
    features: ["Full MLK v3 mastering suite", "Unlimited WAV exports", "Vocal Booth + karaoke DAW"],
  },
  {
    name: "GravelKing Pro Plus",
    price: "$24.99",
    period: "/mo",
    color: "border-amber-500/40 bg-amber-500/5",
    highlight: true,
    badge: "Most Popular",
    badgeColor: "bg-amber-500 text-black",
    features: ["Everything in Weekly", "MLK v3 mastering kernel", "IP Embed Code + authorship cert", "7-day free trial"],
  },
  {
    name: "Node Auditor",
    price: "$499",
    period: "/mo",
    color: "border-purple-500/40 bg-purple-500/5",
    badge: "Enterprise",
    badgeColor: "bg-purple-500 text-white",
    features: ["Everything in Pro Plus", "Unlimited MLK V3.5 optimizer runs", "Up to 100 devices optimized", "White-label WAV & PDF exports"],
  },
];

function AudioCard({ label, sub, src, color, badge }: {
  label: string; sub: string; src: string; color: string; badge: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      await el.play();
      setPlaying(true);
    }
  };

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
        <Volume2 className="w-4 h-4 text-muted-foreground" />
      </div>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} preload="none" />
      <Button
        size="sm"
        variant={label === "After" ? "default" : "outline"}
        className={`w-full h-9 font-semibold text-xs ${label === "After" ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}`}
        onClick={toggle}
      >
        {playing
          ? <><Pause className="w-3.5 h-3.5 mr-1.5" /> Pause</>
          : <><Play className="w-3.5 h-3.5 mr-1.5 fill-current" /> Play {label}</>
        }
      </Button>
    </div>
  );
}

function NotifyBanner() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("notify_dismissed") === "true"
  );
  const { toast } = useToast();

  if (dismissed) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setState("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
      setState("idle");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent p-5 mb-6"
    >
      <button
        onClick={() => { sessionStorage.setItem("notify_dismissed", "true"); setDismissed(true); }}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {state === "done" ? (
              <motion.div key="done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 pt-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-400">Check your inbox!</p>
                  <p className="text-sm text-muted-foreground">We've sent your free trial link — 3 days on us.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="font-semibold text-amber-400 mb-0.5">Pro is live — get 3 days free</p>
                <p className="text-sm text-muted-foreground mb-3">Enter your email and we'll send you a direct activation link. No commitment.</p>
                <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background/60 border-amber-500/20 focus-visible:ring-amber-500/30 h-9 text-sm"
                  />
                  <Button type="submit" size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0" disabled={state === "loading"}>
                    {state === "loading" ? "…" : "Get Free Trial"}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const { isPro, tier } = useAppState();
  const { isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("activated") === "1") {
      toast({ title: "Lifetime access activated!", description: "Your Node Auditor plan is now live. All tools are unlocked." });
      window.history.replaceState({}, "", "/");
    } else if (params.get("activated") === "invalid") {
      toast({ title: "Activation link invalid", description: "This link has already been used or is not valid.", variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-16">

        {!isPro && <NotifyBanner />}

        {/* ── Hero ── */}
        <div className="relative rounded-2xl overflow-hidden text-center space-y-6 pt-6 pb-12 px-6">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=1200&q=80)` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/75 to-black/85" />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/25 rounded-full px-4 py-1.5 text-xs font-medium text-amber-400">
                <Zap className="w-3.5 h-3.5" /> MLK v3 Mastering Engine
              </span>
              <span className="inline-flex items-center gap-1.5 bg-violet-500/15 border border-violet-500/25 rounded-full px-4 py-1.5 text-xs font-medium text-violet-400">
                <ShieldCheck className="w-3.5 h-3.5" /> IP rights certification
              </span>
            </div>

            <h1 className="text-5xl font-bold tracking-tight leading-tight">
              Master your music.<br />
              <span className="text-amber-500">Own your IP.</span>
            </h1>

            <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
              GravelKing Pro masters your tracks with MLK v3, lets you record in a karaoke-style vocal booth,
              and certifies your authorship — the only platform built around IP, mastering, and performance.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/mastering">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-12 px-8 text-base shadow-lg shadow-amber-500/25">
                  <Play className="w-4 h-4 mr-2 fill-current" /> Master a Track — First One Free
                </Button>
              </Link>
              <Link href="/songwriting">
                <Button variant="outline" className="h-12 px-8 text-base border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/60">
                  <ShieldCheck className="w-4 h-4 mr-2" /> Certify Your IP
                </Button>
              </Link>
            </div>

            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                <button onClick={login} className="text-amber-500 underline underline-offset-2 cursor-pointer">Sign in</button> to save your sessions and unlock your free trial.
              </p>
            )}

            {/* Two-pillar stat strip */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
              {[
                { val: "6", label: "Master presets" },
                { val: "IP", label: "Rights certified" },
                { val: "WAV", label: "Lossless output" },
                { val: "DAW", label: "Live multitrack" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm py-3 px-2 text-center">
                  <div className="text-xl font-bold text-amber-400">{s.val}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Before / After Demo ── */}
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Hear the difference</h2>
            <p className="text-sm text-muted-foreground">Same track. 10 seconds. MLK v3 mastering.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Before", sub: "Raw upload", src: "/demo_original.wav", color: "border-border/40 bg-card/30", badge: "bg-zinc-700 text-zinc-300" },
              { label: "After", sub: "MLK v3 Mastered", src: "/demo_mastered.wav", color: "border-amber-500/30 bg-amber-500/5", badge: "bg-amber-500 text-black" },
            ].map(({ label, sub, src, color, badge }) => (
              <AudioCard key={label} label={label} sub={sub} src={src} color={color} badge={badge} />
            ))}
          </div>
          <div className="text-center">
            <Link href="/mastering">
              <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-8 h-11">
                <Wand2 className="w-4 h-4 mr-2" /> Master your track — first one free
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Audio Tools ── */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Studio Tools</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Mastering, vocal performance, multitrack DAW, and IP certification — all in one platform.</p>
            </div>
            <Link href="/studio" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1 shrink-0">
              Open Studio <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AUDIO_TOOLS.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link href={f.href}>
                  <Card className="border-border/30 bg-card/40 hover:border-amber-500/30 hover:border transition-all cursor-pointer h-full group">
                    <CardContent className="p-5 flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 border border-white/10 group-hover:border-amber-500/30 transition-colors`}>
                        {f.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">{f.title}</h3>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${f.badgeColor}`}>{f.badge}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                        <div className="flex items-center gap-1 text-xs text-amber-500 font-medium mt-2">
                          {f.cta} <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── IP Rights Tools ── */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/8 via-violet-400/4 to-transparent p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-violet-400" />
                  <h2 className="text-xl font-bold">IP Rights & Certification</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Build an airtight authorship record. Certify ownership. Embed proof anywhere online.
                </p>
              </div>
              <Badge variant="outline" className="border-violet-500/40 text-violet-400 text-[10px] whitespace-nowrap shrink-0">Pro Feature</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {IP_TOOLS.map((tool, i) => (
                <motion.div key={tool.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                  <Link href={isPro ? tool.href : "/pricing"}>
                    <Card className="border-violet-500/20 bg-background/50 hover:border-violet-400/40 hover:bg-violet-500/5 transition-all cursor-pointer h-full group">
                      <CardContent className="p-4 space-y-3">
                        <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/15 transition-colors">
                          {tool.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm group-hover:text-violet-300 transition-colors mb-1">{tool.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-violet-400 font-medium">
                          {isPro ? tool.cta : "Upgrade to unlock"} <ArrowRight className="w-3 h-3" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>

            {!isPro && (
              <div className="flex items-center justify-between gap-4 pt-1 border-t border-violet-500/15">
                <p className="text-xs text-muted-foreground">IP tools included in GravelKing Pro Plus ($24.99/mo)</p>
                <Link href="/pricing">
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs h-8 px-4 shrink-0">
                    <Crown className="w-3 h-3 mr-1.5" /> Upgrade to Pro
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-center">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Upload your track", body: "Drop any audio file — MP3, WAV, FLAC, M4A. Processing happens on our servers; nothing is stored permanently.", color: "text-amber-400 border-amber-500/30 bg-amber-500/8" },
              { step: "2", title: "Process & separate", body: "Neural AI splits vocals from instrumentals, separates into 5 stems, or masters to your preset — in under 60 seconds.", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/8" },
              { step: "3", title: "Certify & download", body: "Download lossless WAV stems, then use the IP Embed Code to certify your authorship across every platform you distribute on.", color: "text-violet-400 border-violet-500/30 bg-violet-500/8" },
            ].map((step) => (
              <div key={step.step} className={`rounded-xl border p-5 ${step.color}`}>
                <div className="text-2xl font-black mb-3 opacity-60">{step.step}</div>
                <h3 className="font-semibold text-sm mb-1.5">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Pricing Strip ── */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Simple pricing</h2>
            <Link href="/pricing" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
              Full details <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <Card className={`border h-full ${plan.color}`}>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{plan.name}</span>
                        {plan.badge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.badgeColor}`}>{plan.badge}</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                      </div>
                    </div>
                    <ul className="space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link href="/pricing">
                      <Button
                        variant={plan.highlight ? "default" : "outline"}
                        size="sm"
                        className={`w-full text-xs ${plan.highlight ? "bg-amber-500 hover:bg-amber-600 text-black font-semibold" : plan.badge === "Enterprise" ? "border-purple-500/40 text-purple-400 hover:bg-purple-500/10" : ""}`}
                      >
                        {plan.price === "Free" ? "Get Started" : `Get ${plan.name}`}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTAs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6">
          <a href="/whitepaper.html" target="_blank" rel="noopener noreferrer">
            <Card className="border-border/30 bg-card/40 hover:border-violet-500/30 hover:bg-card/60 transition-all cursor-pointer group h-full">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm group-hover:text-violet-300 transition-colors">IP Whitepaper</h3>
                  <p className="text-xs text-muted-foreground mt-1">Read the technical brief on GravelKing's audio fingerprinting and IP rights architecture.</p>
                </div>
              </CardContent>
            </Card>
          </a>

          <Link href="/download">
            <Card className="border-border/30 bg-card/40 hover:border-amber-500/30 hover:bg-card/60 transition-all cursor-pointer group h-full">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">Download Free</h3>
                  <p className="text-xs text-muted-foreground mt-1">Run GravelKing locally on your machine — free features work offline, upgrade online.</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/contact">
            <Card className="border-border/30 bg-card/40 hover:border-sky-500/30 hover:bg-card/60 transition-all cursor-pointer group h-full">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm group-hover:text-sky-300 transition-colors">Contact & Licensing</h3>
                  <p className="text-xs text-muted-foreground mt-1">Enterprise pricing, Node Auditor access, custom integrations, or licensing inquiries.</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

      </motion.div>
    </Layout>
  );
}
