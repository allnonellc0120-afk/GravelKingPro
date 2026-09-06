import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { TrackCard, type LabelTrack } from "@/components/track-card";
import { useTrackPurchase } from "@/hooks/use-track-purchase";
import { useToast } from "@/hooks/use-toast";
import { Disc3, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

function useArtistTracks(artist: string) {
  const [tracks, setTracks] = useState<LabelTrack[]>([]);
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

export default function LabelArtistPage() {
  const params = useParams();
  const artist = params.artist ? decodeURIComponent(params.artist) : "";
  const { tracks, loading } = useArtistTracks(artist);
  const { buy, buying, checkoutElement } = useTrackPurchase();

  return (
    <Layout>
      {checkoutElement}
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
            <TrackCard key={t.id} t={t} buying={buying} onBuy={buy} showArtist={false} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
