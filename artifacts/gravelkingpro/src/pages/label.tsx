import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { useToast } from "@/hooks/use-toast";
import { Disc3, Music, ShoppingCart, Play, User, Loader2 } from "lucide-react";

interface Track {
  id: string;
  title: string;
  artistName: string;
  audioPreviewKey: string;
  coverArtKey: string;
  price: number;
}

function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/tracks")
      .then(r => r.json())
      .then(d => setTracks(d.tracks || []))
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
      const data = await r.json();
      if (data.url) { window.location.href = data.url; return; }
      if (r.status === 401) toast({ title: "Sign in required", description: "Please sign in to purchase tracks.", variant: "destructive" });
      else toast({ title: "Purchase failed", description: data.error || "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Could not start checkout.", variant: "destructive" });
    } finally { setBuying(null); }
  };
  return { buy, buying };
}

export default function LabelPage() {
  const { tracks, loading } = useTracks();
  const { buy, buying } = useBuy();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isPro } = useAppState();

  const byArtist = tracks.reduce((acc, t) => {
    acc[t.artistName] = acc[t.artistName] || [];
    acc[t.artistName].push(t);
    return acc;
  }, {} as Record<string, Track[]>);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Disc3 className="w-6 h-6 text-amber-500" />
              Gravel King Productions Label
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Independent artists · $9.99 per track</p>
          </div>
          <div className="flex gap-2">
            {user && (
              <Link href="/submit">
                <Button variant="outline" className="gap-1.5">
                  <Music className="w-4 h-4" /> Submit Track
                </Button>
              </Link>
            )}
            <Link href="/library">
              <Button variant="outline" className="gap-1.5">
                <User className="w-4 h-4" /> My Library
              </Button>
            </Link>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && tracks.length === 0 && (
          <div className="text-center py-16">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-medium">No tracks yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Artists are uploading. Check back soon.</p>
          </div>
        )}

        {Object.entries(byArtist).map(([artist, artistTracks]) => (
          <div key={artist} className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-500" />
              <h2 className="text-lg font-semibold">
                <Link href={`/label/${encodeURIComponent(artist)}`} className="hover:text-amber-500 transition-colors">
                  {artist}
                </Link>
              </h2>
              <span className="text-xs text-muted-foreground">({artistTracks.length} track{artistTracks.length !== 1 ? "s" : ""})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {artistTracks.map((t) => (
                <Card key={t.id} className="border-border/40 bg-card/40 overflow-hidden group">
                  <div className="relative aspect-square bg-secondary/20 overflow-hidden">
                    <img src={`/api/storage/public-objects/${t.coverArtKey}`} alt={t.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="sm" variant="secondary" className="gap-1">
                        <Play className="w-3 h-3" /> Preview
                      </Button>
                    </div>
                  </div>
                  <CardContent className="pt-4 pb-3">
                    <div className="font-semibold text-sm truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.artistName}</div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm font-bold text-amber-500">${t.price.toFixed(2)}</span>
                      <Button size="sm" className="gap-1" disabled={buying === t.id} onClick={() => buy(t.id)}>
                        {buying === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
                        Buy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
