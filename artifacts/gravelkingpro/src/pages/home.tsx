import { useState, useRef } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Wand2, Music2, LayoutDashboard, PenLine,
  Play, Pause, Volume2, ChevronRight, ArrowRight, Crown,
  FileCode2, Disc3, Smartphone, CheckCircle2, Zap,
  Mail,
} from "lucide-react";
import { motion } from "framer-motion";

/* ─── Audio demo component ──────────────────────────────────────────── */
function DemoPlayer({ label, sub, src, isAfter }: { label: string; sub: string; src: string; isAfter?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = async () => {
    const el = ref.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { await el.play(); setPlaying(true); }
  };
  return (
    <div className={`rounded-xl border p-5 space-y-3 ${isAfter ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 bg-card/30"}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isAfter ? "bg-amber-500 text-black" : "bg-zinc-700 text-zinc-300"}`}>{label}</span>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
        <Volume2 className="w-4 h-4 text-muted-foreground" />
      </div>
      <audio ref={ref} src={src} onEnded={() => setPlaying(false)} preload="none" />
      <Button size="sm" variant={isAfter ? "default" : "outline"}
        className={`w-full h-9 font-semibold text-xs ${isAfter ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}`}
        onClick={toggle}>
        {playing ? <><Pause className="w-3.5 h-3.5 mr-1.5" />Pause</> : <><Play className="w-3.5 h-3.5 mr-1.5 fill-current" />Play {label}</>}
      </Button>
    </div>
  );
}

/* ─── App feature card ───────────────────────────────────────────────── */
function AppCard({ icon, title, desc, badge, badgeColor, href, cta, accent }: {
  icon: React.ReactNode; title: string; desc: string; badge: string;
  badgeColor: string; href: string; cta: string; accent: string;
}) {
  return (
    <Link href={href}>
      <motion.div whileHover={{ y: -3 }} className={`group rounded-2xl border bg-card/40 hover:bg-card/70 transition-all cursor-pointer h-full p-5 flex flex-col gap-4 border-border/30 hover:border-${accent}-500/40`}>
        <div className="flex items-start justify-between">
          <div className={`w-11 h-11 rounded-xl bg-${accent}-500/10 border border-${accent}-500/20 flex items-center justify-center group-hover:bg-${accent}-500/15 transition-colors`}>
            {icon}
          </div>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badgeColor}`}>{badge}</Badge>
        </div>
        <div className="flex-1">
          <h3 className={`font-bold text-sm mb-1.5 group-hover:text-${accent}-400 transition-colors`}>{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
        </div>
        <div className={`flex items-center gap-1 text-xs text-${accent}-400 font-semibold`}>
          {cta} <ArrowRight className="w-3 h-3" />
        </div>
      </motion.div>
    </Link>
  );
}

/* ─── Email sign-up section ──────────────────────────────────────────── */
function SignUpSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
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
      toast({ title: "Error", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
      setState("idle");
    }
  };

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-violet-400/5 to-transparent p-8 text-center space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Mail className="w-5 h-5 text-violet-400" />
          <h2 className="text-2xl font-black">Get 7 Days Free</h2>
        </div>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Sign up with your email and get a free 7-day Pro Plus trial — full mastering suite, vocal booth, DAW, and IP certification. No card required to start.
        </p>
      </div>

      {state === "done" ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-400 font-semibold">Check your inbox — free trial link sent!</span>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-background/60 border-violet-500/25 focus-visible:ring-violet-500/30 h-11 text-sm flex-1"
          />
          <Button type="submit" disabled={state === "loading"}
            className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-11 px-7 shrink-0">
            {state === "loading" ? "…" : "Start Free Trial"}
          </Button>
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        Already have an account?{" "}
        <a href="/api/login" className="text-violet-400 underline underline-offset-2">Sign in here</a>
        {" "}· No commitment · Cancel anytime
      </p>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function Home() {
  const { isAuthenticated, login } = useAuth();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-20">

        {/* ══════════════════════════════════════════
            HERO — IP Rights first
        ══════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-2xl overflow-hidden text-center py-16 px-6">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1400&q=80)` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/80 to-black/90" />

          <div className="relative z-10 space-y-6">
            {/* Pills */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-violet-500/20 border border-violet-500/30 rounded-full px-4 py-1.5 text-xs font-medium text-violet-300">
                <ShieldCheck className="w-3.5 h-3.5" /> IP Rights Certification
              </span>
              <span className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/25 rounded-full px-4 py-1.5 text-xs font-medium text-amber-400">
                <Zap className="w-3.5 h-3.5" /> MLK v3 Mastering Engine
              </span>
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-medium text-emerald-400">
                <Smartphone className="w-3.5 h-3.5" /> Now on Google Play
              </span>
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-tight">
                Own Your Music.<br />
                <span className="text-amber-500">Prove It.</span>
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
                GravelKing Pro is the only music platform that masters your tracks, records your vocals,
                and <strong className="text-white">certifies your IP rights</strong> — with a cryptographic
                authorship certificate no one can dispute.
              </p>
            </div>

            {/* CTA buttons */}
            <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
              <Link href="/songwriting">
                <Button className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-13 px-8 text-base shadow-lg shadow-violet-500/25 h-12">
                  <ShieldCheck className="w-4 h-4 mr-2" /> Certify My IP — Free
                </Button>
              </Link>
              <Link href="/mastering">
                <Button variant="outline" className="h-12 px-8 text-base border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/60 font-bold">
                  <Wand2 className="w-4 h-4 mr-2" /> Master a Track Free
                </Button>
              </Link>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto pt-2">
              {[
                { val: "IP", label: "Rights certified" },
                { val: "6", label: "Master presets" },
                { val: "WAV", label: "Lossless output" },
                { val: "DAW", label: "Live multitrack" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm py-3 px-2 text-center">
                  <div className="text-xl font-bold text-amber-400">{s.val}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground pt-1">
                <button onClick={login} className="text-amber-500 underline underline-offset-2 cursor-pointer">Sign in</button>{" "}
                to save your work and unlock your free trial.
              </p>
            )}
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            IP RIGHTS — The core message
        ══════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-violet-400/5 to-transparent p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black mb-2">Your Music. Your Rights.</h2>
              <p className="text-muted-foreground leading-relaxed">
                The U.S. Copyright Office is clear: <span className="text-white font-medium">AI-generated content gets no copyright protection.</span> Human authorship must be documented and provable. GravelKing Pro creates a tamper-evident certificate that records <em>your</em> creative contribution — every rewrite, every decision, every timestamp.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: <PenLine className="w-5 h-5 text-violet-400" />,
                title: "Document Authorship",
                body: "Every lyric edit, melody decision, and co-writer contribution is timestamped and scored. Your creative timeline is locked.",
                href: "/songwriting",
                cta: "Open Songwriting Studio",
              },
              {
                icon: <FileCode2 className="w-5 h-5 text-amber-400" />,
                title: "IP Certificate",
                body: "A cryptographic authorship certificate is generated for your track — embed it anywhere, share it with labels, use it in disputes.",
                href: "/kernel",
                cta: "View Certificate Dashboard",
              },
              {
                icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
                title: "Prove It Anywhere",
                body: "Your certificate lives on our servers and in your account. It cannot be edited retroactively. It is your proof of ownership.",
                href: "/songwriting",
                cta: "Start Certifying",
              },
            ].map((item, i) => (
              <Link key={i} href={item.href}>
                <div className="group rounded-xl border border-violet-500/20 bg-background/50 hover:border-violet-400/40 hover:bg-violet-500/5 transition-all cursor-pointer p-5 h-full space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">{item.icon}</div>
                  <h3 className="font-bold text-sm group-hover:text-violet-300 transition-colors">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                  <div className="flex items-center gap-1 text-xs text-violet-400 font-semibold">
                    {item.cta} <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-violet-500/15">
            <p className="text-sm text-muted-foreground">IP certification included in GravelKing Pro Plus — <strong className="text-white">7-day free trial</strong></p>
            <Link href="/pricing">
              <Button className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-6 h-10 shrink-0">
                <Crown className="w-3.5 h-3.5 mr-1.5" /> Start Free Trial
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            APP TOOLS — All 4 pillars
        ══════════════════════════════════════════ */}
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black">Everything in One App</h2>
            <p className="text-muted-foreground text-sm">Four professional tools. One platform. Browser-based — no download needed.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AppCard
              icon={<Wand2 className="w-5 h-5 text-amber-400" />}
              title="MLK v3 Mastering"
              desc="Upload any audio file. Choose from 6 professional presets — Broadcast, Vinyl, Podcast, Club, Film, or Normal. Get a studio-quality lossless WAV back in seconds."
              badge="1 Free Master"
              badgeColor="border-amber-500/40 text-amber-400"
              href="/mastering"
              cta="Master a track now"
              accent="amber"
            />
            <AppCard
              icon={<Music2 className="w-5 h-5 text-sky-400" />}
              title="Vocal Booth"
              desc="Record your vocals over any backing track with karaoke-style lyric sync, a teleprompter, and real-time vocal monitoring. Your performance, your way."
              badge="Studio"
              badgeColor="border-sky-500/40 text-sky-400"
              href="/vocal-booth"
              cta="Open the Vocal Booth"
              accent="sky"
            />
            <AppCard
              icon={<LayoutDashboard className="w-5 h-5 text-emerald-400" />}
              title="Live Multitrack DAW"
              desc="Mix 8 stems in real time with EQ, compression, reverb, and per-channel metering — all in a browser tab. No download. No $400 software license."
              badge="Pro"
              badgeColor="border-emerald-500/40 text-emerald-400"
              href="/studio"
              cta="Open the DAW"
              accent="emerald"
            />
            <AppCard
              icon={<PenLine className="w-5 h-5 text-violet-400" />}
              title="Songwriting Studio + IP Cert"
              desc="Document your lyrics, co-writers, and creative timeline. Build an airtight authorship record for every track. Generate your IP certificate from the same screen."
              badge="IP Rights"
              badgeColor="border-violet-500/40 text-violet-400"
              href="/songwriting"
              cta="Certify your authorship"
              accent="violet"
            />
          </div>
        </div>

        {/* ══════════════════════════════════════════
            BEFORE / AFTER AUDIO DEMO
        ══════════════════════════════════════════ */}
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Hear the MLK v3 Difference</h2>
            <p className="text-sm text-muted-foreground">Same track. Same file. 10 seconds of processing.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DemoPlayer label="Before" sub="Raw upload" src="/demo_original.wav" />
            <DemoPlayer label="After" sub="MLK v3 Mastered" src="/demo_mastered.wav" isAfter />
          </div>
          <div className="text-center">
            <Link href="/mastering">
              <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-8 h-11">
                <Wand2 className="w-4 h-4 mr-2" /> Master your track — first one free
              </Button>
            </Link>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            LABEL PAGE
        ══════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 via-emerald-400/4 to-transparent p-8 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Disc3 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-black">GravelKing Label</h2>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">Pro Feature</Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Submit your track to the GravelKing Pro Label. Certified artists get a public artist page, label distribution support, and promotion through the platform. Your IP certificate is verified before submission — your rights stay yours.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, text: "IP-verified before submission" },
              { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, text: "Public artist profile page" },
              { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, text: "Label distribution support" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-3">
                {item.icon}
                <span className="text-xs font-medium">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link href="/label">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 h-10">
                <Disc3 className="w-3.5 h-3.5 mr-1.5" /> Browse the Label
              </Button>
            </Link>
            <Link href="/submit">
              <Button variant="outline" className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 font-semibold h-10 px-6">
                Submit Your Track <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════
            EMAIL SIGN-UP
        ══════════════════════════════════════════ */}
        <SignUpSection />

        {/* ══════════════════════════════════════════
            GOOGLE PLAY / MOBILE APP
        ══════════════════════════════════════════ */}
        <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/8 via-sky-400/4 to-transparent p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
            <Smartphone className="w-7 h-7 text-sky-400" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-black mb-1">Available on Google Play</h2>
            <p className="text-sm text-muted-foreground">The full GravelKing Pro experience — mastering, vocal booth, IP certification, and your library — now on Android. Same account, same tracks.</p>
          </div>
          <a href="https://play.google.com/store/apps/developer?id=Gravelking+Pro" target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-6 h-11 text-sm">
              <Play className="w-4 h-4 mr-2 fill-current" /> Get it on Google Play
            </Button>
          </a>
        </div>

        {/* ══════════════════════════════════════════
            PRICING STRIP
        ══════════════════════════════════════════ */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Simple pricing</h2>
            <Link href="/pricing" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
              Full details <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                name: "Starter", price: "Free", period: null,
                color: "border-border/30",
                features: ["1 free master", "Vocal Booth access", "Songwriting Studio (basic)"],
                cta: "Get Started", ctaStyle: "outline" as const,
              },
              {
                name: "GravelKing Weekly", price: "$9.99", period: "/week",
                color: "border-emerald-500/30 bg-emerald-500/5",
                badge: "Flexible", badgeColor: "bg-emerald-500 text-black",
                features: ["Full MLK v3 mastering", "Unlimited WAV exports", "Vocal Booth + karaoke DAW"],
                cta: "Start Weekly", ctaStyle: "outline" as const,
              },
              {
                name: "Pro Plus", price: "$24.99", period: "/mo",
                color: "border-amber-500/40 bg-amber-500/5",
                badge: "Most Popular", badgeColor: "bg-amber-500 text-black",
                features: ["Everything in Weekly", "IP certificate", "7-day free trial"],
                cta: "Start Free Trial", ctaStyle: "default" as const,
                highlight: true,
              },
              {
                name: "Node Auditor", price: "$249.50", period: "/mo",
                color: "border-purple-500/40 bg-purple-500/5",
                badge: "Enterprise", badgeColor: "bg-purple-500 text-white",
                features: ["Everything in Pro Plus", "MLK V3.5 optimizer", "White-label exports"],
                cta: "Contact Us", ctaStyle: "outline" as const,
              },
            ].map((plan) => (
              <Link key={plan.name} href={plan.name === "Node Auditor" ? "/contact" : "/pricing"}>
                <div className={`rounded-xl border p-5 space-y-4 h-full ${plan.color} hover:border-amber-500/30 transition-colors cursor-pointer`}>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{plan.name}</span>
                      {plan.badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${plan.badgeColor}`}>{plan.badge}</span>}
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-2xl font-black">{plan.price}</span>
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
                  <Button variant={plan.ctaStyle} size="sm"
                    className={`w-full text-xs ${plan.highlight ? "bg-amber-500 hover:bg-amber-600 text-black font-semibold" : ""}`}>
                    {plan.cta}
                  </Button>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            BOTTOM NAV CARDS
        ══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-8">
          <a href="/whitepaper.html" target="_blank" rel="noopener noreferrer">
            <div className="group rounded-xl border border-border/30 bg-card/40 hover:border-violet-500/30 transition-all cursor-pointer p-5 flex items-start gap-3 h-full">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-violet-300 transition-colors">IP Whitepaper</h3>
                <p className="text-xs text-muted-foreground mt-1">Technical brief on GravelKing's audio fingerprinting and IP rights architecture.</p>
              </div>
            </div>
          </a>
          <Link href="/download">
            <div className="group rounded-xl border border-border/30 bg-card/40 hover:border-amber-500/30 transition-all cursor-pointer p-5 flex items-start gap-3 h-full">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-amber-400 transition-colors">Download Free</h3>
                <p className="text-xs text-muted-foreground mt-1">Run GravelKing locally on your machine. Free features work offline.</p>
              </div>
            </div>
          </Link>
          <Link href="/contact">
            <div className="group rounded-xl border border-border/30 bg-card/40 hover:border-sky-500/30 transition-all cursor-pointer p-5 flex items-start gap-3 h-full">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-sky-300 transition-colors">Contact & Licensing</h3>
                <p className="text-xs text-muted-foreground mt-1">Enterprise pricing, Node Auditor access, and custom integrations.</p>
              </div>
            </div>
          </Link>
        </div>

      </div>
    </Layout>
  );
}
