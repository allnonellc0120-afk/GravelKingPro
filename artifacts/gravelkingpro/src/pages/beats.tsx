import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import {
  Music,
  Download,
  Play,
  Pause,
  Star,
  Mic,
  Scissors,
  Zap,
  Calendar,
} from "lucide-react";

interface Beat {
  id: number;
  title: string;
  artist: string;
  genre: string | null;
  bpm: number | null;
  description: string | null;
  tags: string | null;
  isFeatured: boolean;
  monthYear: string | null;
  downloadCount: number;
  mimeType: string | null;
  fileName: string | null;
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function beatAudioUrl(id: number) {
  return `${BASE}/api/beats/${id}/audio`;
}

function BeatPlayer({ beat }: { beat: Beat }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [, navigate] = useLocation();

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = beatAudioUrl(beat.id);
    a.download = beat.fileName ?? `${beat.title}.mp3`;
    a.click();
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5 flex flex-col gap-4 hover:border-amber-500/40 transition-colors group">
      <audio
        ref={audioRef}
        src={beatAudioUrl(beat.id)}
        onEnded={() => setPlaying(false)}
        preload="none"
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {beat.isFeatured && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-black bg-amber-500 px-2 py-0.5 rounded-full">
                <Star className="w-2.5 h-2.5" /> BOTM
              </span>
            )}
            {beat.genre && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {beat.genre}
              </span>
            )}
            {beat.bpm && (
              <span className="text-[10px] font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                {beat.bpm} BPM
              </span>
            )}
          </div>
          <h3 className="font-bold text-foreground truncate">{beat.title}</h3>
          <p className="text-xs text-muted-foreground">{beat.artist}</p>
        </div>

        {/* Play button */}
        <button
          onClick={toggle}
          className="shrink-0 w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-colors shadow-md"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      </div>

      {beat.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{beat.description}</p>
      )}

      {beat.tags && (
        <div className="flex flex-wrap gap-1">
          {beat.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
            <span key={tag} className="text-[10px] text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/30">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-secondary/60 hover:bg-secondary px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download className="w-3 h-3" /> Download Free
        </button>
        <button
          onClick={() => navigate("/studio?tool=stem_split")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-500 px-3 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors"
          title="Open Stem Splitter"
        >
          <Scissors className="w-3 h-3" /> Stem Split
        </button>
        <button
          onClick={() => navigate("/studio?tool=voice_remove")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-500 px-3 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors"
          title="Open Voice Remover"
        >
          <Mic className="w-3 h-3" /> Voice Remove
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground/50 text-right">
        {beat.downloadCount.toLocaleString()} downloads
      </p>
    </div>
  );
}

export default function BeatsPage() {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/beats`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.success) setBeats(data.beats);
        else setError(data.error ?? "Failed to load beats.");
      })
      .catch(() => setError("Could not reach the server."))
      .finally(() => setLoading(false));
  }, []);

  const featured = beats.find(b => b.isFeatured);
  const library  = beats.filter(b => !b.isFeatured);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-12">

        {/* Page header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">
            <Zap className="w-3.5 h-3.5" />
            GravelKing Beats
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Beats by Kevin Morris
          </h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Free beats produced by GravelKing — download, test our tools, or just vibe.
            New drops every month.
          </p>
        </div>

        {/* Beat of the Month */}
        {loading ? (
          <div className="h-48 bg-card border border-border/40 rounded-2xl animate-pulse" />
        ) : featured ? (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-amber-500">
                Beat of the Month
                {featured.monthYear && <span className="text-muted-foreground font-normal normal-case ml-2">— {featured.monthYear}</span>}
              </h2>
            </div>
            <div className="bg-gradient-to-br from-amber-500/10 via-card to-card border border-amber-500/30 rounded-2xl p-6 sm:p-8">
              <BeatPlayer beat={featured} />
            </div>
          </section>
        ) : null}

        {/* Sample Library */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Music className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-500">
              Sample Library
            </h2>
            {library.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">({library.length} beats)</span>
            )}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-52 bg-card border border-border/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16 text-muted-foreground text-sm">{error}</div>
          ) : library.length === 0 && !featured ? (
            <div className="text-center py-16 space-y-3">
              <Music className="w-10 h-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">No beats yet — check back soon.</p>
            </div>
          ) : library.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              More beats dropping soon — stay tuned.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {library.map(beat => (
                <BeatPlayer key={beat.id} beat={beat} />
              ))}
            </div>
          )}
        </section>

        {/* Footer note */}
        <div className="text-center text-xs text-muted-foreground/50 pb-4">
          All beats produced by Kevin Morris · GravelKing Productions · All N One LLC<br />
          Free for personal use — contact us for licensing
        </div>
      </div>
    </Layout>
  );
}
