import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrackCard, type LabelTrack } from "@/components/track-card";
import { useAppState } from "@/lib/context";
import { useToast } from "@/hooks/use-toast";
import {
  Disc3, Music, User, Loader2, ChevronRight, ShieldCheck,
  Mic2, Star, Globe, FileCode2, ArrowRight, Headphones,
} from "lucide-react";
import { motion } from "framer-motion";

function useTracks() {
  const [tracks, setTracks] = useState<LabelTrack[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/tracks")
      .then(r => r.json())
      .then((d: { tracks?: LabelTrack[] }) => setTracks(d.tracks || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, []);
  return { tracks, loading };
}

function useBuy() {
  const { toast } = useToast();
  const [buying, setBuying] = useState<string | null>(null);
  const buy = async (trackId: string) => {
    setBuying(trackId);
    try {
      const r = await fetch(`/api/tracks/${trackId}/checkout`, { method: "POST", credentials: "include" });
      const data = await r.json() as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      toast({ title: "Purchase failed", description: data.error || "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Could not start checkout.", variant: "destructive" });
    } finally { setBuying(null); }
  };
  return { buy, buying };
}

const LABEL_VALUES = [
  {
    icon: <ShieldCheck className="w-5 h-5 text-violet-400" />,
    title: "IP-Certified Releases",
    body: "Every track released through GravelKing Productions comes with an embedded authorship certificate — a machine-readable proof of ownership that travels with the file, forever.",
  },
  {
    icon: <Mic2 className="w-5 h-5 text-amber-400" />,
    title: "Artist-First Philosophy",
    body: "You keep your masters. We provide the infrastructure — professional audio processing, IP documentation, and distribution tools — while you retain full ownership of your creative work.",
  },
  {
    icon: <Globe className="w-5 h-5 text-emerald-400" />,
    title: "Independent & Transparent",
    body: "GravelKing Productions is an independent label built on the same platform artists use. No hidden fees, no ownership grabs. You see exactly what we do and how it works.",
  },
  {
    icon: <Star className="w-5 h-5 text-sky-400" />,
    title: "Professional Audio Processing",
    body: "Every submission goes through MLK v3 neural optimization, professional mastering, and stem analysis before release — the same tools available to Pro subscribers.",
  },
];

export default function LabelPage() {
  const { tracks, loading } = useTracks();
  const { buy, buying } = useBuy();
  const { isPro } = useAppState();

  const byArtist = tracks.reduce((acc, t) => {
    acc[t.artistName] = acc[t.artistName] || [];
    acc[t.artistName].push(t);
    return acc;
  }, {} as Record<string, LabelTrack[]>);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-16">

        {/* ── Label Hero ── */}
        <div className="relative rounded-2xl overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&q=80)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/80 to-black/95" />
          <div className="relative z-10 px-8 py-14 text-center space-y-5">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Disc3 className="w-8 h-8 text-amber-500" />
              <span className="text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">Independent Label</span>
            </div>
            <h1 className="text-5xl font-black tracking-tight">
              GravelKing Productions
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              We're not just a tool — we're a label built on the belief that independent artists
              deserve the same IP protection and audio quality as major label acts.
              Every release is processed, certified, and protected.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
              {isPro && (
                <Link href="/submit">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-11 px-7">
                    <Music className="w-4 h-4 mr-2" /> Submit Your Track
                  </Button>
                </Link>
              )}
              <Link href="/mastering">
                <Button variant="outline" className="h-11 px-7 border-white/20 text-white hover:bg-white/10">
                  <Headphones className="w-4 h-4 mr-2" /> Try the Tools
                </Button>
              </Link>
            </div>
            {!isPro && (
              <p className="text-xs text-muted-foreground">
                <Link href="/pricing" className="text-amber-400 underline underline-offset-2">Upgrade to Pro</Link> to submit tracks to the label.
              </p>
            )}
          </div>
        </div>

        {/* ── What We Stand For ── */}
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold">What We Stand For</h2>
            <p className="text-muted-foreground text-sm">The values behind every release on GravelKing Productions.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {LABEL_VALUES.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card className="border-border/30 bg-card/40 h-full">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 border border-white/10">
                      {v.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1.5">{v.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{v.body}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── IP Certification Feature ── */}
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/8 via-violet-400/4 to-transparent p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
              <FileCode2 className="w-7 h-7 text-violet-400" />
            </div>
            <div className="flex-1">
              <Badge variant="outline" className="border-violet-500/40 text-violet-400 text-[10px] mb-2">Exclusive to GravelKing</Badge>
              <h3 className="text-xl font-bold mb-2">Every Track Gets an IP Embed Code</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                When you release through GravelKing Productions, your track is fingerprinted and assigned
                a certified authorship embed. You can paste this widget anywhere — SoundCloud bio,
                website, Instagram — and it cryptographically proves you created the work.
                No other independent label does this.
              </p>
            </div>
            <Link href="/songwriting">
              <Button variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10 shrink-0">
                Learn More <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Catalog ── */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Label Catalog</h2>
              <p className="text-sm text-muted-foreground mt-0.5">All tracks available for purchase — $9.99 per track.</p>
            </div>
            <div className="flex gap-2">
              {isPro && (
                <Link href="/submit">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Music className="w-4 h-4" /> Submit Track
                  </Button>
                </Link>
              )}
              <Link href="/library">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <User className="w-4 h-4" /> My Library
                </Button>
              </Link>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && tracks.length === 0 && (
            <div className="text-center py-20 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-secondary/40 flex items-center justify-center mx-auto">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Catalog Coming Soon</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Artists are submitting their first tracks now. Check back soon — or submit your own if you're on Pro.
              </p>
              {!isPro && (
                <Link href="/pricing">
                  <Button size="sm" className="mt-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                    Upgrade to Submit
                  </Button>
                </Link>
              )}
            </div>
          )}

          {Object.entries(byArtist).map(([artist, artistTracks]) => {
            const preview = artistTracks.slice(0, 3);
            const hasMore = artistTracks.length > 3;
            return (
              <div key={artist} className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-500" />
                  <h3 className="text-base font-semibold">
                    <Link href={`/label/${encodeURIComponent(artist)}`} className="hover:text-amber-500 transition-colors">
                      {artist}
                    </Link>
                  </h3>
                  <span className="text-xs text-muted-foreground">({artistTracks.length} track{artistTracks.length !== 1 ? "s" : ""})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {preview.map((t) => (
                    <TrackCard key={t.id} t={t} buying={buying} onBuy={buy} />
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-end">
                    <Link href={`/label/${encodeURIComponent(artist)}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-amber-500 hover:text-amber-400">
                        View all {artistTracks.length} tracks <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Bottom CTA ── */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4 mb-4">
          <h2 className="text-xl font-bold">Ready to release?</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            GravelKing Pro subscribers can submit tracks directly to the label catalog.
            Your music gets professionally processed, IP-certified, and listed for sale.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {isPro
              ? <Link href="/submit"><Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold"><Music className="w-4 h-4 mr-2" /> Submit Your Track</Button></Link>
              : <Link href="/pricing"><Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold">Upgrade to Pro — $39.99/mo</Button></Link>
            }
            <Link href="/contact">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">Contact the Label</Button>
            </Link>
          </div>
        </div>

      </div>
    </Layout>
  );
}
