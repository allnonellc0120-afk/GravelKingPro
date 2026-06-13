import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Mic2, Scissors, Wand2, Layers,
  Play, ChevronRight, CheckCircle2, Zap, Download,
  Mail, Lock, Bell, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const FEATURES = [
  {
    icon: <Mic2 className="w-6 h-6 text-purple-400" />,
    title: "Voice Removal",
    description: "Strip vocals from any stereo track using center-channel cancellation. Get a clean instrumental in seconds.",
    badge: "1 Free Use",
    badgeColor: "border-sky-500/40 text-sky-400",
    href: "/studio",
    cta: "Try it free",
    img: "https://p3.hippopx.com/preview/152/995/female-artist-recording-song-professional-music-studio-female-singer-recording-vocals-microphone-music-production-studio-recording-artist-recording-music-studio-thumbnail.jpg",
  },
  {
    icon: <Scissors className="w-6 h-6 text-emerald-400" />,
    title: "Stem Splitting",
    description: "Separate bass, midrange, highs, and instrumental stems — download each as a clean WAV file.",
    badge: "1 Free Use",
    badgeColor: "border-sky-500/40 text-sky-400",
    href: "/studio",
    cta: "Try it free",
    img: "https://static.vecteezy.com/system/resources/thumbnails/067/167/854/small/soundwave-in-blue-a-vibrant-mesmerizing-blue-soundwave-pulses-with-energy-against-a-dark-backdrop-embodying-the-dynamic-essence-of-audio-frequencies-free-video.jpg",
  },
  {
    icon: <Wand2 className="w-6 h-6 text-sky-400" />,
    title: "Audio Mastering",
    description: "6 professional presets: Normal, Broadcast, Vinyl, Podcast, Club, and Film. One click to a polished master.",
    badge: "30s Preview Free",
    badgeColor: "border-emerald-500/40 text-emerald-400",
    href: "/studio",
    cta: "Master now",
    img: "https://audiosorcerer.com/images/blog/2024/07/Mastering-For-Vinyl-Blog-Image-3-1024x536.jpg",
  },
  {
    icon: <Layers className="w-6 h-6 text-amber-400" />,
    title: "Mix Studio",
    description: "Multi-track editor with speed/pitch control, live vocal monitoring, per-stem metrics, and layer mixing.",
    badge: "Studio",
    badgeColor: "border-amber-500/40 text-amber-400",
    href: "/mix",
    cta: "Open Studio",
    img: "https://media.istockphoto.com/id/1393796601/photo/podcast-recording-studio-with-microphones-and-equalizer-for-recording-online-radio-broadcasts.jpg?s=612x612&w=0&k=20&c=hjSlStVKVGmWp2VY_YVF3MNHnOzKLeAKbtiasTM_xjo=",
  },
  {
    icon: <Scissors className="w-6 h-6 text-emerald-400" />,
    title: "Stem Splitting",
    description: "Separate any track into 5 stems — vocals, drums, bass, other, and a full instrumental. 1 free split.",
    badge: "1 Free",
    badgeColor: "border-emerald-500/40 text-emerald-400",
    href: "/studio",
    cta: "Split a track",
    img: "https://media.istockphoto.com/id/2111019920/photo/aspiring-rapper-recording-a-new-track-in-a-soundproof-studio-at-night.jpg?s=612x612&w=0&k=20&c=xtqwolfuS5JS9dLc9KXR4Ib05p7M3FuUHrrOPSovpMs=",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    color: "border-border/30",
    features: ["3 free voice removals", "1 free stem split (5 stems)", "1 free full master", "Live vocal monitoring", "Beats library"],
  },
  {
    name: "GravelKing Weekly",
    price: "$9.99",
    period: "/week",
    color: "border-emerald-500/40 bg-emerald-500/5",
    highlight: true,
    badge: "Most Popular",
    badgeColor: "bg-emerald-500 text-black",
    features: ["Unlimited voice removal", "Unlimited 5-stem splitting", "All preset masters + denoise", "Download all stems as WAV", "Processing history"],
  },
  {
    name: "GravelKing Studio",
    price: "$29.99",
    period: "/month",
    color: "border-amber-500/40 bg-amber-500/5",
    badge: "Full Studio",
    badgeColor: "bg-amber-500 text-black",
    features: ["Everything in Weekly", "Adjustable mastering kernel", "Live DAW + recording", "Kernel Dashboard + PDF", "Priority support"],
  },
];

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

  const handleDismiss = () => {
    sessionStorage.setItem("notify_dismissed", "true");
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent p-5 mb-6"
    >
      <button
        onClick={handleDismiss}
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
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 pt-1"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-400">Check your inbox!</p>
                  <p className="text-sm text-muted-foreground">We've sent your free trial link — 3 days on us.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="font-semibold text-amber-400 mb-0.5">
                  Pro is live — get 3 days free
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter your email and we'll send you a direct link to activate your free trial. No commitment.
                </p>
                <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background/60 border-amber-500/20 focus-visible:ring-amber-500/30 h-9 text-sm"
                    data-testid="input-notify-email"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0"
                    disabled={state === "loading"}
                    data-testid="button-notify-submit"
                  >
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
  const { isPro } = useAppState();
  const { isAuthenticated, login } = useAuth();

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-12">

        {!isPro && <NotifyBanner />}

        {/* ── Hero ── */}
        <div className="relative rounded-2xl overflow-hidden text-center space-y-5 pt-4 pb-10 px-4">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(https://p3.hippopx.com/preview/938/421/black-microphone-studio-microphone-shock-mount-dark-backdrop-audio-recording-recording-setup-professional-audio-black-background-microphone-stand-recording-equipment-thumbnail.jpg)` }}
          />
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative z-10 space-y-5 pt-4">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-amber-400">
              <Zap className="w-3.5 h-3.5" /> Server-side audio processing — your files never leave our servers
            </div>
            <h1 className="text-4xl font-bold tracking-tight leading-tight">
              Professional audio tools,<br />
              <span className="text-amber-500">no plugin required.</span>
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              GravelKing Productions handles voice removal, stem splitting, mastering, beat-making, and songwriting — entirely on the server. Upload a file or pick a tool and go.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/studio">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12 px-8 text-base shadow-lg shadow-amber-500/20">
                  <Play className="w-4 h-4 mr-2 fill-current" /> Open Studio — It's Free
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" className="h-12 px-8 text-base border-white/30 text-white hover:bg-white/10">
                  See Pricing <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                <button onClick={login} className="text-amber-500 underline underline-offset-2 cursor-pointer">Sign in</button> to save your processing history and unlock your free trial.
              </p>
            )}

            {/* DAW preview mockup */}
            <div className="mt-6 rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/60 max-w-2xl mx-auto text-left">
              {/* Transport bar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/8 bg-white/3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/70" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/70" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500/70" />
                </div>
                <span className="text-[10px] font-mono text-white/30 tracking-widest">MIX STUDIO</span>
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex gap-1">
                    {["▐▐","▶","■"].map((s,i) => (
                      <div key={i} className={`w-6 h-5 rounded text-[8px] flex items-center justify-center border ${i===1 ? "border-amber-500/60 text-amber-400 bg-amber-500/10" : "border-white/10 text-white/30"}`}>{s}</div>
                    ))}
                  </div>
                  <div className="font-mono text-[10px] text-amber-400/80 border border-amber-500/20 rounded px-1.5 py-0.5 bg-amber-500/5">0:00.000</div>
                </div>
              </div>
              {/* Tracks */}
              {[
                { label: "Kick",   color: "bg-amber-500",   bars: [0.9,0.1,0.85,0.1,0.88,0.1,0.9,0.1,0.85,0.1,0.9,0.1,0.88,0.1,0.9,0.1] },
                { label: "Vocals", color: "bg-purple-400",  bars: [0.4,0.6,0.55,0.7,0.45,0.65,0.5,0.72,0.48,0.63,0.52,0.68,0.44,0.71,0.5,0.6] },
                { label: "Bass",   color: "bg-cyan-400",    bars: [0.7,0.65,0.72,0.68,0.7,0.66,0.71,0.67,0.69,0.64,0.73,0.68,0.7,0.65,0.72,0.67] },
                { label: "FX",     color: "bg-emerald-400", bars: [0.2,0.3,0.25,0.35,0.28,0.22,0.32,0.18,0.27,0.33,0.21,0.29,0.26,0.31,0.23,0.28] },
              ].map((track) => (
                <div key={track.label} className="flex items-stretch border-b border-white/5 last:border-0">
                  <div className="w-16 shrink-0 px-3 py-2 flex flex-col justify-center gap-0.5 border-r border-white/5">
                    <span className="text-[10px] font-medium text-white/60">{track.label}</span>
                    <div className="flex gap-1">
                      <div className="text-[8px] px-1 rounded border border-white/10 text-white/20">M</div>
                      <div className="text-[8px] px-1 rounded border border-white/10 text-white/20">S</div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-px px-2 py-2">
                    {track.bars.map((h, i) => (
                      <div key={i} className={`flex-1 rounded-sm ${track.color} opacity-70`} style={{ height: `${h * 28}px` }} />
                    ))}
                  </div>
                </div>
              ))}
              <div className="px-4 py-1.5 flex items-center gap-2 bg-white/2">
                <span className="text-[9px] text-white/20 font-medium tracking-widest uppercase">Plugins active</span>
                {["EQ","Comp","Reverb","Limiter"].map(p => (
                  <span key={p} className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20 text-amber-400/50 bg-amber-500/5">{p}</span>
                ))}
                <span className="ml-auto text-[9px] text-white/20">Pro only</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">What you can do</h2>
            <Link href="/studio" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
              Open Studio <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <Link href={f.href}>
                  <Card className="border-border/30 bg-card/40 hover:border-amber-500/30 hover:border transition-all cursor-pointer h-full group overflow-hidden">
                    <div className="relative h-36 overflow-hidden">
                      <img
                        src={f.img}
                        alt={f.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                      <div className="absolute top-3 right-3">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 backdrop-blur-sm bg-black/40 ${f.badgeColor}`}>{f.badge}</Badge>
                      </div>
                      <div className="absolute bottom-3 left-3 w-9 h-9 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10">
                        {f.icon}
                      </div>
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-semibold group-hover:text-amber-400 transition-colors">{f.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                      <div className="flex items-center gap-1 text-xs text-amber-500 font-medium pt-1">
                        {f.cta} <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Pricing Strip ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Simple pricing</h2>
            <Link href="/pricing" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
              Full details <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        className={`w-full text-xs ${plan.highlight ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" : plan.badge === "Full Studio" ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : ""}`}
                      >
                        {plan.price === "Free" ? "Get Started" : `Get ${plan.name.replace("GravelKing ", "")}`}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTAs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4">
          <Link href="/download">
            <Card className="border-border/30 bg-card/40 hover:border-amber-500/30 hover:bg-card/60 transition-all cursor-pointer group h-full">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">Download Free</h3>
                  <p className="text-xs text-muted-foreground mt-1">Run GravelKing locally. Free features work on your machine — upgrade online.</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/contact">
            <Card className="border-border/30 bg-card/40 hover:border-amber-500/30 hover:bg-card/60 transition-all cursor-pointer group h-full">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">Contact Us</h3>
                  <p className="text-xs text-muted-foreground mt-1">Licensing, enterprise, Node Auditor access, or custom integrations.</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {isPro ? (
            <Link href="/kernel">
              <Card className="border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all cursor-pointer group h-full">
                <CardContent className="p-5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">Kernel Dashboard</h3>
                    <p className="text-xs text-muted-foreground mt-1">Live telemetry, MLK v3 analysis, routing config, and PDF reports.</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link href="/pricing">
              <Card className="border-border/30 bg-card/40 hover:border-amber-500/30 hover:bg-card/60 transition-all cursor-pointer group h-full">
                <CardContent className="p-5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">Kernel Dashboard</h3>
                    <p className="text-xs text-muted-foreground mt-1">Live kernel metrics, routing, and PDF reports — Pro & Node Auditor.</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

      </motion.div>
    </Layout>
  );
}
