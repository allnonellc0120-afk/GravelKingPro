import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Disc3, ShoppingCart, Play, Pause, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface Track {
  id: string;
  title: string;
  artistName: string;
  audioPreviewKey: string;
  coverArtKey: string;
  price: number;
}

function useArtistTracks(artist: string) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!artist) { setLoading(false); return; }
    fetch(`/api/tracks/artist/${encodeURIComponent(artist)}`)
      .then(r => r.json())
      .then(d => setTracks(d.tracks || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [artist]);
  return { tracks, loading };
}

function useBuy() {
  const { toast } = useToast();
  const [buying, setBuying] = useState<string | null>(null);
  const buy = async (trackId: string) => {
    setBuying(trackId);
    try {
      const r = await fetch(`/api/tracks/${trackId}/checkout`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (data.url) { window.location.href = data.url; return; }
      toast({ title: "Purchase failed", description: data.error || "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Could not start checkout.", variant: "destructive" });
    } finally { setBuying(null); }
  };
  return { buy, buying };
}

function TrackCard({ t, buying, onBuy }: { t: Track; buying: string | null; onBuy: (id: string) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const togglePreview = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  return (
    <Card className="border-border/40 bg-card/40 overflow-hidden group">
      <div className="relative aspect-square bg-secondary/20 overflow-hidden">
        <img
          src={`/api/storage/public-objects/${t.coverArtKey}`}
          alt={t.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button size="sm" variant="secondary" className="gap-1" onClick={togglePreview}>
            {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {playing ? "Stop" : "Preview"}
          </Button>
        </div>
        <audio
          ref={audioRef}
          src={`/api/storage/public-objects/${t.audioPreviewKey}`}
          onEnded={() => setPlaying(false)}
          preload="none"
        />
      </div>
      <CardContent className="pt-4 pb-3">
        <div className="font-semibold text-sm truncate">{t.title}</div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm font-bold text-amber-500">${t.price.toFixed(2)}</span>
          <Button size="sm" className="gap-1" disabled={buying === t.id} onClick={() => onBuy(t.id)}>
            {buying === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
            Buy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LabelArtistPage() {
  const params = useParams();
  const artist = params.artist ? decodeURIComponent(params.artist) : "";
  const { tracks, loading } = useArtistTracks(artist);
  const { buy, buying } = useBuy();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/label">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" /> Back to Label
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-xl">
            {artist?.[0]?.toUpperCase() || "A"}
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Disc3 className="w-6 h-6 text-amber-500" />
              {artist}
            </h1>
            <p className="text-sm text-muted-foreground">{tracks.length} track{tracks.length !== 1 ? "s" : ""} available</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && tracks.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">No tracks found for this artist.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((t) => (
            <TrackCard key={t.id} t={t} buying={buying} onBuy={buy} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
