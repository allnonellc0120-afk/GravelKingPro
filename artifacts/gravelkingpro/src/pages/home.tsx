import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  ArrowLeftRight,
  Mic2,
  PenLine,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { motion } from "framer-motion";
import { trackFunnelEvent } from "@/lib/useAnalytics";

type ToolCardProps = {
  icon: React.ReactNode;
  name: string;
  description: string;
  detail: string;
  href: string;
  accent: string;
  badge: string;
};

function ToolCard({ icon, name, description, detail, href, accent, badge }: ToolCardProps) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -4 }}
        className={`group h-full rounded-2xl border border-${accent}-500/25 bg-card/35 p-5 transition-all hover:border-${accent}-400/60 hover:bg-card/70`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border border-${accent}-500/30 bg-${accent}-500/10`}>
            {icon}
          </div>
          <Badge variant="outline" className={`border-${accent}-500/40 text-${accent}-300 text-[10px]`}>
            {badge}
          </Badge>
        </div>
        <h2 className={`mt-6 text-lg font-bold group-hover:text-${accent}-300`}>{name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <p className="mt-4 border-t border-white/10 pt-4 text-xs font-medium text-muted-foreground">{detail}</p>
        <div className={`mt-5 flex items-center gap-1 text-sm font-semibold text-${accent}-300`}>
          Open tool <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </motion.div>
    </Link>
  );
}

export default function Home() {
  return (
    <Layout>
      <main className="mx-auto max-w-6xl px-1 py-8 sm:py-14">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl"
        >
          <div className="mb-5 flex flex-wrap gap-2">
            <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-300">GRAVELKING PRO</Badge>
            <Badge variant="outline" className="border-white/15 text-muted-foreground">Four focused tools</Badge>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
            Make it. <span className="text-amber-400">Prove it.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A focused workspace for finishing music, documenting authorship, and delivering clean audio.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/mastering">
              <Button
                onClick={() => trackFunnelEvent("landing_cta_clicked", { cta: "home_foundry" })}
                className="h-11 bg-amber-500 px-5 font-bold text-black hover:bg-amber-400"
              >
                <Wand2 className="mr-2 h-4 w-4" /> Open The Foundry
              </Button>
            </Link>
            <Link href="/songwriting">
              <Button variant="outline" className="h-11 border-white/20 px-5">
                Start with JAX <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.header>

        <section className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Core tools">
          <ToolCard
            icon={<Wand2 className="h-5 w-5 text-amber-300" />}
            name="The Foundry"
            description="Morris Law Kernel V3.5 Audio Mastering Engine for broadcast-ready, high-resolution masters."
            detail="Presets, adaptive processing, WAV and MP3 delivery"
            href="/mastering"
            accent="amber"
            badge="MASTERING"
          />
          <ToolCard
            icon={<PenLine className="h-5 w-5 text-violet-300" />}
            name="JAX"
            description="Songwriting Companion & Provenance Engine for drafting, editing, and preserving your creative record."
            detail="Lyrics, revision history, authorship and provenance"
            href="/songwriting"
            accent="violet"
            badge="SONGWRITING"
          />
          <ToolCard
            icon={<Mic2 className="h-5 w-5 text-sky-300" />}
            name="Vocal Booth"
            description="Audio recording with backing-track playback, lyric timing, and a tactile clip/splice editor."
            detail="Record, monitor, arrange and review takes"
            href="/vocal-booth"
            accent="sky"
            badge="RECORDING"
          />
          <ToolCard
            icon={<ArrowLeftRight className="h-5 w-5 text-emerald-300" />}
            name="Converter"
            description="Audio container and format conversion utility for moving cleanly between production formats."
            detail="Fast browser upload and downloadable output"
            href="/convert"
            accent="emerald"
            badge="UTILITY"
          />
        </section>

        <section className="mt-10 grid gap-4 border-t border-white/10 pt-7 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Authorship-aware workflows</div>
          <div className="flex items-center gap-3"><Wand2 className="h-4 w-4 text-amber-400" /> Morris Kernel V3.5 processing</div>
          <div className="flex items-center gap-3"><ArrowRight className="h-4 w-4 text-sky-400" /> Built for phone and tablet</div>
        </section>
      </main>
    </Layout>
  );
}