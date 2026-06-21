import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import { Library, Download, Music, ArrowLeft, Loader2, LogIn } from "lucide-react";
import { Link, useLocation } from "wouter";

interface Track {
  id: string;
  title: string;
  artistName: string;
  audioFullKey: string;
  coverArtKey: string;
  price: number;
}

export default function LibraryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetch("/api/library", { credentials: "include" })
      .then(r => r.json())
      .then(d => setTracks(d.tracks || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [user]);

  const download = async (trackId: string) => {
    setDownloading(trackId);
    try {
      const r = await fetch(`/api/tracks/${trackId}/download`, { credentials: "include" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({})) as { error?: string };
        toast({ title: "Download failed", description: data.error || "Please try again.", variant: "destructive" });
        return;
      }
      // Stream directly to device — no redirect, no third-party URL
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") ?? "";
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] ?? "track.wav";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Could not start download.", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto py-8 text-center">
          <LogIn className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-xl font-bold">Sign in to view your library</h1>
          <p className="text-sm text-muted-foreground mt-1">Your purchased tracks will appear here.</p>
          <a href="/api/login" className="inline-block mt-4">
            <Button>Sign in</Button>
          </a>
        </div>
      </Layout>
    );
  }

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
        <div className="flex items-center gap-2">
          <Library className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold">My Library</h1>
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
            <p className="text-sm text-muted-foreground mt-1">Tracks you purchase will appear here.</p>
            <Link href="/label">
              <Button className="mt-4" variant="outline">Browse Label</Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((t) => (
            <Card key={t.id} className="border-border/40 bg-card/40 overflow-hidden">
              <div className="relative aspect-square bg-secondary/20 overflow-hidden">
                <img src={`/api/storage/public-objects/${t.coverArtKey}`} alt={t.title} className="w-full h-full object-cover" />
              </div>
              <CardContent className="pt-4 pb-3">
                <div className="font-semibold text-sm truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground truncate">{t.artistName}</div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">Purchased</span>
                  <Button size="sm" variant="outline" className="gap-1" disabled={downloading === t.id} onClick={() => download(t.id)}>
                    {downloading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
