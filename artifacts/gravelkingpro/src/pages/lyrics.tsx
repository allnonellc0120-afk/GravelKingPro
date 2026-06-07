/**
 * GravelKing Lyrics Hub
 * GravelKing Protocol — All N One LLC
 * Powered by lrclib.net
 */
import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Music2, Mic2, Clock, Zap, Copy, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { searchLyrics, parseLrc, formatTime, type LrclibTrack, type LrcLine } from "@/lib/lrclib";
import { useToast } from "@/hooks/use-toast";

function LrcViewer({ track }: { track: LrclibTrack }) {
  const [showSynced, setShowSynced] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const lrcLines: LrcLine[] = track.syncedLyrics ? parseLrc(track.syncedLyrics) : [];
  const hasSync = lrcLines.length > 0;
  const displayLines = hasSync && showSynced ? lrcLines : null;
  const plainLines = (track.plainLyrics ?? "").split("\n");

  const PREVIEW_COUNT = 12;
  const totalLines = displayLines ? displayLines.length : plainLines.length;
  const canExpand = totalLines > PREVIEW_COUNT;
  const visibleLines = expanded || !canExpand
    ? (displayLines ?? plainLines)
    : (displayLines ?? plainLines).slice(0, PREVIEW_COUNT);

  const handleCopy = () => {
    const text = track.syncedLyrics && showSynced
      ? track.syncedLyrics
      : track.plainLyrics ?? "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Lyrics copied" });
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/30 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground truncate">{track.trackName}</h3>
          <p className="text-xs text-muted-foreground">{track.artistName}
            {track.albumName && <span className="text-muted-foreground/50"> · {track.albumName}</span>}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {track.instrumental && (
              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">Instrumental</span>
            )}
            {hasSync && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Synced LRC
              </span>
            )}
            {track.duration > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">{formatTime(track.duration * 1000)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasSync && (
            <button
              onClick={() => setShowSynced(s => !s)}
              className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${showSynced ? "border-amber-500 text-amber-400 bg-amber-500/10" : "border-border/40 text-muted-foreground"}`}
            >
              {showSynced ? "LRC" : "Plain"}
            </button>
          )}
          <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground">
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Lyrics body */}
      <div className="p-4">
        {track.instrumental ? (
          <p className="text-center text-muted-foreground text-sm py-6">Instrumental track — no lyrics</p>
        ) : (
          <div className="space-y-1">
            {displayLines
              ? (visibleLines as LrcLine[]).map((line, i) => (
                <div key={i} className="flex items-baseline gap-3 group">
                  <span className="text-[10px] font-mono text-amber-500/50 w-10 shrink-0 text-right group-hover:text-amber-500 transition-colors">
                    {formatTime(line.timeMs)}
                  </span>
                  <span className="text-sm text-foreground/90 leading-relaxed">
                    {line.text || <span className="text-muted-foreground/30">♪</span>}
                  </span>
                </div>
              ))
              : (visibleLines as string[]).map((line, i) => (
                <p key={i} className={`text-sm leading-relaxed ${line === "" ? "h-3" : "text-foreground/90"}`}>
                  {line}
                </p>
              ))
            }
            {canExpand && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-amber-400 py-2 border border-dashed border-border/30 rounded-lg hover:border-amber-500/30 transition-colors"
              >
                {expanded
                  ? <><ChevronUp className="w-3 h-3" /> Show less</>
                  : <><ChevronDown className="w-3 h-3" /> Show all {totalLines} lines</>
                }
              </button>
            )}
          </div>
        )}
      </div>
      <div className="px-4 pb-3 text-[10px] text-muted-foreground/40 text-right">
        Lyrics via lrclib.net · GravelKing Protocol
      </div>
    </div>
  );
}

export default function LyricsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LrclibTrack[]>([]);
  const [selected, setSelected] = useState<LrclibTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setSearched(true);
    try {
      const tracks = await searchLyrics(query.trim());
      setResults(tracks);
    } catch {
      setError("Could not reach lrclib — check your connection.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">
            <Zap className="w-3.5 h-3.5" /> GravelKing Lyrics Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Synced Lyrics Search</h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Search any song — get timestamped LRC lyrics instantly. Use as reference for your own writing.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by song title, artist, or both..."
              className="w-full bg-card border border-border/50 rounded-lg pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {loading ? <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </form>

        {/* Results layout */}
        <div className="grid lg:grid-cols-5 gap-6">

          {/* Track list */}
          <div className="lg:col-span-2 space-y-2">
            {loading && (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-card border border-border/40 rounded-lg animate-pulse" />)}
              </div>
            )}
            {error && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
            {!loading && searched && results.length === 0 && !error && (
              <div className="text-center py-12 space-y-2">
                <Music2 className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-muted-foreground text-sm">No results found — try a different search.</p>
              </div>
            )}
            {!loading && !searched && (
              <div className="text-center py-16 space-y-3">
                <Mic2 className="w-10 h-10 text-muted-foreground/20 mx-auto" />
                <p className="text-muted-foreground text-sm">Search for a song to see lyrics</p>
              </div>
            )}
            <AnimatePresence>
              {results.map((track, i) => (
                <motion.button
                  key={track.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelected(track)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected?.id === track.id
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border/40 bg-card hover:border-amber-500/30 hover:bg-card/80"
                  }`}
                >
                  <p className="text-sm font-medium truncate">{track.trackName}</p>
                  <p className="text-xs text-muted-foreground truncate">{track.artistName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {track.syncedLyrics && (
                      <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">LRC</span>
                    )}
                    {track.instrumental && (
                      <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Instrumental</span>
                    )}
                    {!track.plainLyrics && !track.syncedLyrics && !track.instrumental && (
                      <span className="text-[9px] text-muted-foreground/50">No lyrics</span>
                    )}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Lyrics viewer */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <LrcViewer track={selected} />
                </motion.div>
              ) : (
                <div className="h-64 flex items-center justify-center rounded-xl border-2 border-dashed border-border/20 text-center p-6">
                  <div className="space-y-2">
                    <Music2 className="w-8 h-8 text-muted-foreground/20 mx-auto" />
                    <p className="text-muted-foreground text-sm">Select a track to view lyrics</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </Layout>
  );
}
