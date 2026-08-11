import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/download";
import { Library, Download, Music, ArrowLeft, Loader2, FileText, Mic, CheckCircle2, Clock } from "lucide-react";
import { Link, useSearch } from "wouter";

interface Track {
  id: string;
  title: string;
  artistName: string;
  audioFullKey: string;
  coverArtKey: string;
  price: number;
}

interface SongDraft {
  draftId: string;
  genre?: string;
  storyPrompt?: string;
  aiDraft: string;
  authorshipScore: number;
  isCopyrightEligible: boolean;
  is_certified?: boolean;
  lineCount: number;
  createdAt: string;
}

interface AudioJob {
  jobId: string;
  fileName: string;
  mode: string;
  tier: string;
  status: string;
  model?: string;
  createdAt: string;
  completedAt?: string;
}

type Tab = "tracks" | "songs" | "stems";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function LibraryPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [songs, setSongs] = useState<SongDraft[]>([]);
  const [jobs, setJobs] = useState<AudioJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [studioLoading, setStudioLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const search = useSearch();

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/library", { credentials: "include" });
      const d = (await r.json()) as { tracks?: Track[] };
      setTracks(d.tracks || []);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStudio = async () => {
    setStudioLoading(true);
    try {
      const r = await fetch("/api/library/studio", { credentials: "include" });
      const d = (await r.json()) as { songs?: SongDraft[]; jobs?: AudioJob[] };
      setSongs(d.songs || []);
      setJobs(d.jobs || []);
    } catch {
      setSongs([]);
      setJobs([]);
    } finally {
      setStudioLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(search);
    const cs = params.get("cs");
    if (cs) {
      setConfirming(true);
      fetch("/api/tracks/confirm-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ checkoutSessionId: cs }),
      })
        .then(() => {
          toast({ title: "Purchase complete!", description: "Your track is now in your library." });
        })
        .catch(() => {})
        .finally(() => {
          setConfirming(false);
          loadLibrary();
        });
    } else {
      loadLibrary();
    }
    loadStudio();
  }, []);

  const download = async (trackId: string, format: "wav" | "mp3" = "wav") => {
    setDownloading(`${trackId}:${format}`);
    try {
      const r = await fetch(`/api/tracks/${trackId}/download${format === "mp3" ? "?format=mp3" : ""}`, { credentials: "include" });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Download failed", description: data.error || "Please try again.", variant: "destructive" });
        return;
      }
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") ?? "";
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] ?? "track.wav";
      downloadBlob(blob, filename);
    } catch {
      toast({ title: "Error", description: "Could not start download.", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const TabButton = ({ id, label, icon, count }: { id: Tab; label: string; icon: React.ReactNode; count: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        tab === id ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === id ? "bg-amber-500/30" : "bg-muted/40"}`}>{count}</span>
    </button>
  );

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

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-border/40 pb-3">
          <TabButton id="tracks" label="Purchased Tracks" icon={<Music className="w-4 h-4" />} count={tracks.length} />
          <TabButton id="songs" label="Lyrics & Songs" icon={<FileText className="w-4 h-4" />} count={songs.length} />
          <TabButton id="stems" label="Audio Stems" icon={<Mic className="w-4 h-4" />} count={jobs.length} />
        </div>

        {/* ── Purchased Tracks ── */}
        {tab === "tracks" && (
          <>
            {(loading || confirming) && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                {confirming && <span className="ml-2 text-sm text-muted-foreground">Confirming your purchase…</span>}
              </div>
            )}

            {!loading && !confirming && tracks.length === 0 && (
              <div className="text-center py-16">
                <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-lg font-medium">No tracks yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Tracks you purchase will appear here.</p>
                <Link href="/label">
                  <Button className="mt-4" variant="outline">Browse Label</Button>
                </Link>
              </div>
            )}

            {!loading && !confirming && tracks.length > 0 && (
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
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="gap-1" disabled={downloading === `${t.id}:wav`} onClick={() => download(t.id, "wav")}>
                            {downloading === `${t.id}:wav` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            WAV
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" disabled={downloading === `${t.id}:mp3`} onClick={() => download(t.id, "mp3")}>
                            {downloading === `${t.id}:mp3` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            MP3
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Lyrics & Songs ── */}
        {tab === "songs" && (
          <>
            {studioLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!studioLoading && songs.length === 0 && (
              <div className="text-center py-16">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-lg font-medium">No saved lyrics yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Songs you generate in the Songwriting Studio appear here.</p>
                <Link href="/songwriting">
                  <Button className="mt-4" variant="outline">Open Songwriting Studio</Button>
                </Link>
              </div>
            )}
            {!studioLoading && songs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {songs.map((s) => (
                  <Card key={s.draftId} className="border-border/40 bg-card/40">
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{s.genre || "Song"}</span>
                        {s.is_certified ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Certified
                          </span>
                        ) : (
                          <span className="text-xs text-rose-400/80 shrink-0">AI Draft</span>
                        )}
                      </div>
                      {s.storyPrompt && (
                        <p className="text-xs text-muted-foreground line-clamp-2 italic">&ldquo;{s.storyPrompt}&rdquo;</p>
                      )}
                      <p className="text-xs text-muted-foreground/80 line-clamp-3 whitespace-pre-wrap">{s.aiDraft.slice(0, 180)}…</p>
                      <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                        <span>{s.lineCount} lines · {s.authorshipScore}% human</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(s.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Audio Stems ── */}
        {tab === "stems" && (
          <>
            {studioLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!studioLoading && jobs.length === 0 && (
              <div className="text-center py-16">
                <Mic className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-lg font-medium">No processed audio yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Mastered tracks and DAW sessions appear here after processing.</p>
                <Link href="/mastering">
                  <Button className="mt-4" variant="outline">Master a Track</Button>
                </Link>
              </div>
            )}
            {!studioLoading && jobs.length > 0 && (
              <div className="space-y-3">
                {jobs.map((j) => (
                  <Card key={j.jobId} className="border-border/40 bg-card/40">
                    <CardContent className="py-3 flex items-center gap-3">
                      <Mic className="w-5 h-5 text-amber-500/70 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{j.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {j.mode.replace(/_/g, " ")} · {j.tier} · {formatDate(j.createdAt)}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                          j.status.includes("COMPLETE")
                            ? "bg-emerald-500/15 text-emerald-400"
                            : j.status.includes("ERROR") || j.status.includes("FAIL")
                              ? "bg-rose-500/15 text-rose-400"
                              : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
