import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { TrackCard, type LabelTrack } from "@/components/track-card";
import { useAppState } from "@/lib/context";
import { useToast } from "@/hooks/use-toast";
import { Disc3, Music, User, Loader2, ChevronRight } from "lucide-react";

function useTracks() {
  const [tracks, setTracks] = useState<LabelTrack[]>([]);
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
      toast({ title: "Purchase failed", description: data.error || "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Could not start checkout.", variant: "destructive" });
    } finally { setBuying(null); }
  };
  return { buy, buying };
}

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
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Disc3 className="w-6 h-6 text-amber-500" />
              Gravelking Productions Label
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Independent artists · $9.99 per track</p>
          </div>
          <div className="flex gap-2">
            {isPro && (
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

        {Object.entries(byArtist).map(([artist, artistTracks]) => {
          const preview = artistTracks.slice(0, 3);
          const hasMore = artistTracks.length > 3;
          return (
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
    </Layout>
  );
}
