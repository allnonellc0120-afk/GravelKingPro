import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/download";
import { ExportQuotaBadge } from "@/components/export-quota-badge";
import { formatResetDate, useExportQuota } from "@/hooks/use-export-quota";
import {
  Library, Download, Music, ArrowLeft, Loader2, FileText, Mic,
  CheckCircle2, Clock, Play, Pause, Wand2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";

interface Track {
  id: string;
  title: string;
  artistName: string;
  coverArtKey: string;
  audioPreviewKey: string;
  price: number;
  lyricsText?: string | null;
  createdAt?: string;
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

function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Selected-track player: cover, transport, seek bar, lyrics, downloads, and
 * a per-track Master action. Playback streams from /api/tracks/:id/stream —
 * the authenticated full-quality route that does NOT consume the export quota.
 */
function TrackPlayer({
  track, onBack, onPrev, onNext, hasPrev, hasNext,
  quota, downloading, onDownload,
}: {
  track: Track;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  quota: ReturnType<typeof useExportQuota>["quota"];
  downloading: string | null;
  onDownload: (trackId: string, format: "wav" | "mp3") => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Reset playback state when the selected track changes.
  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setAudioError(null);
  }, [track.id]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      // iOS: play must launch inside the gesture.
      void el.play().catch(() => {
        setAudioError("Playback failed — the track may still be uploading. Try again shortly.");
      });
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const t = Number(e.target.value);
    el.currentTime = t;
    setTime(t);
  };

  return (
    <div className="space-y-5" data-testid="track-player">
      {/* Navigation row */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={onBack} data-testid="button-player-back">
          <ArrowLeft className="w-4 h-4" /> All tracks
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={!hasPrev} onClick={onPrev} data-testid="button-player-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" disabled={!hasNext} onClick={onNext} data-testid="button-player-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Cover + transport */}
        <div className="space-y-4">
          <div className="relative aspect-square rounded-2xl overflow-hidden border border-border/40 bg-secondary/20">
            <img
              src={`/api/storage/public-objects/${track.coverArtKey}`}
              alt={track.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
              aria-label={playing ? "Pause" : "Play"}
              data-testid="button-player-cover-toggle"
            >
              {playing
                ? <Pause className="w-14 h-14 text-white drop-shadow-lg" />
                : <Play className="w-14 h-14 text-white drop-shadow-lg" />}
            </button>
          </div>

          <div>
            <h2 className="text-lg font-bold truncate" data-testid="text-player-title">{track.title}</h2>
            <p className="text-sm text-muted-foreground truncate">{track.artistName}</p>
          </div>

          {/* Transport */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={togglePlay}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-full w-10 h-10 p-0"
                data-testid="button-player-play"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </Button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={time}
                onChange={seek}
                className="flex-1 accent-amber-500"
                aria-label="Seek"
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
              <span>{fmtTime(time)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
            {audioError && <p className="text-xs text-rose-400">{audioError}</p>}
          </div>

          <audio
            ref={audioRef}
            src={`/api/tracks/${track.id}/stream`}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime((e.target as HTMLAudioElement).currentTime)}
            onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
            onError={() => setAudioError("Could not load audio for this track.")}
          />

          {/* Actions */}
          <div className="space-y-2">
            <Link href={`/mastering?gkTrack=${encodeURIComponent(track.id)}&gkTitle=${encodeURIComponent(track.title)}`}>
              <Button className="w-full bg-sky-500 hover:bg-sky-600 text-black font-bold" data-testid="button-player-master">
                <Wand2 className="w-4 h-4 mr-2" /> Master this track
              </Button>
            </Link>
            {quota && quota.remaining <= 0 ? (
              <p className="text-[11px] text-rose-400 text-center leading-tight">
                Export limit reached — resets {formatResetDate(quota.resetsAt)}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={downloading === `${track.id}:wav`}
                  onClick={() => onDownload(track.id, "wav")}
                  data-testid="button-player-download-wav"
                >
                  {downloading === `${track.id}:wav` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  WAV
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={downloading === `${track.id}:mp3`}
                  onClick={() => onDownload(track.id, "mp3")}
                  data-testid="button-player-download-mp3"
                >
                  {downloading === `${track.id}:mp3` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  MP3
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/60 text-center">
              Playback is free — downloads count toward your rolling 30-day export quota.
            </p>
          </div>
        </div>

        {/* Lyrics pane */}
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5 min-h-[300px]">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold">Lyrics</span>
            {track.lyricsText?.startsWith("[AI-written lyrics]") && (
              <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-400 ml-1">
                AI-written
              </Badge>
            )}
          </div>
          {track.lyricsText ? (
            <pre className="text-sm font-mono text-foreground/85 whitespace-pre-wrap leading-relaxed max-h-[480px] overflow-y-auto" data-testid="text-player-lyrics">
              {track.lyricsText.startsWith("[AI-written lyrics]\n")
                ? track.lyricsText.slice("[AI-written lyrics]\n".length)
                : track.lyricsText}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No lyrics on file for this track — it's an instrumental or an uploaded purchase.
            </p>
          )}
        </div>
      </div>
    </div>
  );
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useSearch();
  const [, navigate] = useLocation();
  const { quota, refresh: refreshQuota } = useExportQuota();

  const loadLibrary = async (): Promise<Track[]> => {
    setLoading(true);
    try {
      const r = await fetch("/api/library", { credentials: "include" });
      const d = (await r.json()) as { tracks?: Track[] };
      const list = d.tracks || [];
      setTracks(list);
      return list;
    } catch {
      setTracks([]);
      return [];
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
    // ?track=<id> — deep link straight into the player (e.g. right after
    // generation in the Songwriting Studio).
    const wantTrack = params.get("track");
    const finish = async () => {
      const list = await loadLibrary();
      if (wantTrack && list.some((t) => t.id === wantTrack)) {
        setSelectedId(wantTrack);
      }
    };
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
          void finish();
        });
    } else {
      void finish();
    }
    loadStudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      void refreshQuota();
    } catch {
      toast({ title: "Error", description: "Could not start download.", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const selectedIdx = tracks.findIndex((t) => t.id === selectedId);
  const selected = selectedIdx >= 0 ? tracks[selectedIdx] : null;

  const selectTrack = (id: string | null) => {
    setSelectedId(id);
    // Keep the URL shareable/back-navigable without a full reload.
    navigate(id ? `/library?track=${encodeURIComponent(id)}` : "/library", { replace: true });
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
        <div className="flex flex-wrap items-center gap-2">
          <Library className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold">My Library</h1>
          <ExportQuotaBadge quota={quota} className="ml-auto" />
        </div>

        {/* Tabs (hidden while the player is open — the player has its own back nav) */}
        {!selected && (
          <div className="flex flex-wrap gap-2 border-b border-border/40 pb-3">
            <TabButton id="tracks" label="My Tracks" icon={<Music className="w-4 h-4" />} count={tracks.length} />
            <TabButton id="songs" label="Lyrics & Songs" icon={<FileText className="w-4 h-4" />} count={songs.length} />
            <TabButton id="stems" label="Audio Stems" icon={<Mic className="w-4 h-4" />} count={jobs.length} />
          </div>
        )}

        {/* ── Player (selected track) ── */}
        {selected && (
          <TrackPlayer
            track={selected}
            onBack={() => selectTrack(null)}
            onPrev={() => { if (selectedIdx > 0) selectTrack(tracks[selectedIdx - 1]!.id); }}
            onNext={() => { if (selectedIdx < tracks.length - 1) selectTrack(tracks[selectedIdx + 1]!.id); }}
            hasPrev={selectedIdx > 0}
            hasNext={selectedIdx >= 0 && selectedIdx < tracks.length - 1}
            quota={quota}
            downloading={downloading}
            onDownload={download}
          />
        )}

        {/* ── Track grid ── */}
        {!selected && tab === "tracks" && (
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
                <p className="text-sm text-muted-foreground mt-1">Generate a song in the Songwriting Studio or purchase from the Label.</p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Link href="/songwriting">
                    <Button variant="outline">Songwriting Studio</Button>
                  </Link>
                  <Link href="/label">
                    <Button variant="outline">Browse Label</Button>
                  </Link>
                </div>
              </div>
            )}

            {!loading && !confirming && tracks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tracks.map((t) => (
                  <Card
                    key={t.id}
                    className="border-border/40 bg-card/40 overflow-hidden cursor-pointer hover:border-amber-500/40 transition-colors group"
                    onClick={() => selectTrack(t.id)}
                    data-testid={`card-track-${t.id}`}
                  >
                    <div className="relative aspect-square bg-secondary/20 overflow-hidden">
                      <img src={`/api/storage/public-objects/${t.coverArtKey}`} alt={t.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-10 h-10 text-white drop-shadow-lg" />
                      </div>
                    </div>
                    <CardContent className="pt-4 pb-3">
                      <div className="font-semibold text-sm truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.artistName}</div>
                      <div className="flex items-center justify-between mt-2">
                        {t.lyricsText
                          ? <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Lyrics</Badge>
                          : <span />}
                        <span className="text-[11px] text-amber-400 font-medium">Open player →</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Lyrics & Songs ── */}
        {!selected && tab === "songs" && (
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
                <p className="text-sm text-muted-foreground mt-1">Songs you save in the Songwriting Studio appear here.</p>
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
        {!selected && tab === "stems" && (
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
