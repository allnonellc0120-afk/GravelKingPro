import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { useAppState } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square, Play, Pause, Upload, Download, Music, FileText, RotateCcw, Loader2, Scissors, Volume2, VolumeX, Sparkles, Wand2, Search } from "lucide-react";
import { useVocalBoothRecorder, blobToUploadFile } from "@/lib/daw/useVocalBoothRecorder";
import { splitSong, analyzeGuideTiming, SplitError, type TimedLine } from "@/lib/daw/stemTiming";
import { searchLyrics, parseLrc, type LrclibTrack } from "@/lib/lrclib";
import { downloadBlob } from "@/lib/download";

const DEV_BYPASS_KEY = "gk:dev:studio";

const AUDIO_EXTS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "oga", "weba", "aiff", "au", "snd", "wma"]);
function isAudioLike(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type.startsWith("audio/") || file.type.startsWith("video/") || AUDIO_EXTS.has(ext);
}

interface SongDraft {
  draftId: string;
  genre?: string;
  storyPrompt?: string;
  aiDraft: string;
  authorshipScore: number;
  isCopyrightEligible: boolean;
  lineCount: number;
  createdAt: string;
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function VocalBooth() {
  const { isPro } = useAppState();
  const [devBypass, setDevBypass] = useState(() => {
    try { return localStorage.getItem(DEV_BYPASS_KEY) === "1"; } catch { return false; }
  });
  const canUseStudio = isPro || devBypass;

  if (!canUseStudio) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto text-center space-y-4 py-20">
          <div className="text-5xl">🎤</div>
          <h1 className="text-2xl font-bold">Vocal Booth</h1>
          <p className="text-muted-foreground text-sm">
            Sing over any backing track with a scrolling-lyrics teleprompter, record your vocal,
            and mix it down through the Morris Law kernel — all part of GravelKing Pro.
          </p>
          <a href="/pricing" className="inline-block mt-2">
            <button className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl text-sm transition-colors">Upgrade to Pro</button>
          </a>
          <button
            onClick={() => { localStorage.setItem(DEV_BYPASS_KEY, "1"); setDevBypass(true); }}
            className="block mx-auto text-[10px] text-muted-foreground underline opacity-50 hover:opacity-100"
          >
            Dev bypass
          </button>
        </div>
      </Layout>
    );
  }

  return <VocalBoothInner />;
}

function VocalBoothInner() {
  const { toast } = useToast();
  const recorder = useVocalBoothRecorder();

  // ── lyrics ──
  const [songs, setSongs] = useState<SongDraft[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [lyrics, setLyrics] = useState("");
  const [lyricSource, setLyricSource] = useState<string>("");
  const [lrcQuery, setLrcQuery] = useState("");
  const [lrcResults, setLrcResults] = useState<LrclibTrack[] | null>(null);
  const [lrcSearching, setLrcSearching] = useState(false);
  const [timingSource, setTimingSource] = useState<"lrc" | "energy" | null>(null);

  // ── backing track ──
  const [backingFile, setBackingFile] = useState<File | null>(null);
  const [backingUrl, setBackingUrl] = useState<string | null>(null);
  const [backingPlaying, setBackingPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  // ── mixdown ──
  const [mixing, setMixing] = useState(false);

  // ── split-your-own-song → guide vocal + energy-based line timing ──
  const [splitting, setSplitting] = useState(false);
  const [guideVocalBlob, setGuideVocalBlob] = useState<Blob | null>(null);
  const [guideVocalUrl, setGuideVocalUrl] = useState<string | null>(null);
  const [guideEnabled, setGuideEnabled] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [timedLines, setTimedLines] = useState<TimedLine[] | null>(null);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [timing, setTiming] = useState(false);

  const backingRef = useRef<HTMLAudioElement | null>(null);
  const vocalPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const guideVocalRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitInputRef = useRef<HTMLInputElement>(null);
  const teleprompterRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const timedLinesRef = useRef<TimedLine[] | null>(null);
  const activeLineRef = useRef(-1);

  const guideAudible = guideEnabled && !isPreviewing && !!guideVocalUrl;

  const lyricLines = lyrics.split("\n");

  // Load saved songs from the studio library.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/library/studio", { credentials: "include" });
        if (!r.ok) return;
        const d = (await r.json()) as { songs?: SongDraft[] };
        if (alive) setSongs(d.songs ?? []);
      } catch {
        // non-fatal — user can still paste lyrics
      } finally {
        if (alive) setSongsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Backing object URL lifecycle.
  useEffect(() => {
    if (!backingFile) { setBackingUrl(null); return; }
    const url = URL.createObjectURL(backingFile);
    setBackingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [backingFile]);

  // Guide-vocal object URL lifecycle.
  useEffect(() => {
    if (!guideVocalBlob) { setGuideVocalUrl(null); return; }
    const url = URL.createObjectURL(guideVocalBlob);
    setGuideVocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [guideVocalBlob]);

  // Keep refs used by the rAF loop in sync (avoids stale closures).
  useEffect(() => {
    timedLinesRef.current = timedLines;
    activeLineRef.current = -1;
    setActiveLineIdx(-1);
  }, [timedLines]);

  // Mute/unmute the guide vocal without interrupting playback sync.
  useEffect(() => {
    const g = guideVocalRef.current;
    if (g) g.muted = !guideAudible;
  }, [guideAudible]);

  // Drive teleprompter scroll + progress from backing playback time.
  useEffect(() => {
    if (!backingPlaying) {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const tick = () => {
      const a = backingRef.current;
      if (a && a.duration > 0) {
        const frac = a.currentTime / a.duration;
        setProgress(frac);
        setPosition(a.currentTime);

        // Keep the guide vocal locked to the backing track (correct audible drift).
        const g = guideVocalRef.current;
        if (g && !g.paused && Math.abs(g.currentTime - a.currentTime) > 0.075) {
          g.currentTime = a.currentTime;
        }

        const el = teleprompterRef.current;
        if (el) {
          const tl = timedLinesRef.current;
          if (tl && tl.length) {
            // Energy-based highlight: the latest line whose start time has passed.
            let idx = -1;
            for (let k = 0; k < tl.length; k++) {
              if (tl[k].t <= a.currentTime) idx = tl[k].idx; else break;
            }
            if (idx !== activeLineRef.current) {
              activeLineRef.current = idx;
              setActiveLineIdx(idx);
              const lineEl = idx >= 0 ? lineRefs.current[idx] : null;
              if (lineEl) el.scrollTop = lineEl.offsetTop - el.clientHeight / 2 + lineEl.clientHeight / 2;
            }
          } else {
            const max = el.scrollHeight - el.clientHeight;
            if (max > 0) el.scrollTop = frac * max;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [backingPlaying]);

  const pickSong = useCallback((song: SongDraft) => {
    setLyrics(song.aiDraft ?? "");
    setLyricSource(song.draftId);
    setTimedLines(null);
    setTimingSource(null);
    setActiveLineIdx(-1);
  }, []);

  const searchLrclib = useCallback(async () => {
    if (!lrcQuery.trim()) return;
    setLrcSearching(true);
    setLrcResults(null);
    try {
      const results = await searchLyrics(lrcQuery.trim());
      setLrcResults(results.slice(0, 8));
    } catch {
      toast({ title: "Lyrics search failed", description: "Could not reach lrclib.net", variant: "destructive" });
    } finally {
      setLrcSearching(false);
    }
  }, [lrcQuery, toast]);

  const pickLrcTrack = useCallback((track: LrclibTrack) => {
    setLrcResults(null);
    setLrcQuery("");
    setActiveLineIdx(-1);
    activeLineRef.current = -1;
    if (track.syncedLyrics) {
      const lrcLines = parseLrc(track.syncedLyrics).filter((l) => l.text.trim());
      setLyrics(lrcLines.map((l) => l.text).join("\n"));
      setTimedLines(lrcLines.map((l, i) => ({ idx: i, t: l.timeMs / 1000 })));
      setTimingSource("lrc");
      setLyricSource(`lrc:${track.id}`);
      toast({ title: "Lyrics loaded", description: `${track.trackName} — ${track.artistName} · synced timing` });
    } else if (track.plainLyrics) {
      setLyrics(track.plainLyrics);
      setTimedLines(null);
      setTimingSource(null);
      setLyricSource(`lrc:${track.id}`);
      toast({ title: "Lyrics loaded", description: `${track.trackName} — ${track.artistName} · no synced timing` });
    }
  }, [toast]);

  const resetGuide = useCallback(() => {
    setGuideVocalBlob(null);
    setTimedLines(null);
    setTimingSource(null);
    setActiveLineIdx(-1);
    activeLineRef.current = -1;
  }, []);

  // Energy-based, approximate timing of lyric lines against the guide vocal.
  const runTiming = useCallback(async (blob: Blob, currentLyrics: string) => {
    if (!currentLyrics.trim()) { setTimedLines(null); setTimingSource(null); return; }
    setTiming(true);
    try {
      const timed = await analyzeGuideTiming(blob, currentLyrics.split("\n"));
      setTimedLines(timed);
      setTimingSource(timed ? "energy" : null);
    } catch {
      setTimedLines(null);
      setTimingSource(null);
    } finally {
      setTiming(false);
    }
  }, []);

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!isAudioLike(file)) {
      toast({ title: "Not an audio file", description: file.name, variant: "destructive" });
      return;
    }
    recorder.reset();
    resetGuide();
    setBackingFile(file);
    setProgress(0);
    setPosition(0);
    setBackingPlaying(false);
  }, [recorder, resetGuide, toast]);

  // Split a full song → instrumental becomes the backing track, vocals the guide.
  const handleSplitFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!isAudioLike(file)) {
      toast({ title: "Not an audio file", description: file.name, variant: "destructive" });
      return;
    }
    recorder.reset();
    resetGuide();
    setSplitting(true);
    try {
      const { instrumental, vocals } = await splitSong(file);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "song";
      setBackingFile(new File([instrumental], `${baseName} (instrumental).wav`, { type: "audio/wav" }));
      setProgress(0);
      setPosition(0);
      setBackingPlaying(false);
      setGuideVocalBlob(vocals);
      toast({ title: "Song split", description: "Instrumental loaded as your backing track; vocals added as a guide." });
      void runTiming(vocals, lyrics);
    } catch (e) {
      const err = e as SplitError;
      toast({
        title: err?.paywall ? "Pro required" : "Couldn't split song",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSplitting(false);
    }
  }, [recorder, resetGuide, runTiming, lyrics, toast]);

  // Prepare + start the guide vocal in lockstep with the backing track. Returns
  // the play() promise (or null) so callers can kick it off inside the SAME user
  // gesture as the backing track — iOS/Safari blocks a 2nd audio.play() that
  // happens after an awaited promise resolves.
  const startGuide = useCallback((): Promise<void> | null => {
    const a = backingRef.current;
    const g = guideVocalRef.current;
    if (!a || !g || !guideVocalUrl) return null;
    g.currentTime = a.currentTime;
    g.muted = !guideAudible;
    return g.play().catch(() => {});
  }, [guideVocalUrl, guideAudible]);

  const toggleBacking = useCallback(async () => {
    const a = backingRef.current;
    if (!a) return;
    if (a.paused) {
      // Start backing + guide together, no awaits in between (autoplay guard).
      const guidePlay = startGuide();
      await Promise.allSettled([a.play(), guidePlay ?? Promise.resolve()]);
    } else {
      a.pause();
    }
  }, [startGuide]);

  const seekBacking = useCallback((frac: number) => {
    const a = backingRef.current;
    if (a && a.duration > 0) {
      a.currentTime = frac * a.duration;
      const g = guideVocalRef.current;
      if (g) g.currentTime = a.currentTime;
      setProgress(frac);
      setPosition(a.currentTime);
    }
  }, []);

  // The single user gesture: reset backing to 0, arm the recorder, then play.
  const startTake = useCallback(async () => {
    if (!backingFile) { toast({ title: "Add a backing track first", variant: "destructive" }); return; }
    const a = backingRef.current;
    if (!a) return;
    recorder.reset();
    a.currentTime = 0;
    const ok = await recorder.start();
    if (!ok) return;
    // Start backing + guide together so the guide isn't blocked by autoplay.
    const guidePlay = startGuide();
    const [backingResult] = await Promise.allSettled([a.play(), guidePlay ?? Promise.resolve()]);
    if (backingResult.status === "rejected") {
      recorder.stop();
      toast({ title: "Playback blocked", description: "Tap play once, then try recording again.", variant: "destructive" });
    }
  }, [backingFile, recorder, startGuide, toast]);

  const stopTake = useCallback(() => {
    recorder.stop();
    backingRef.current?.pause();
  }, [recorder]);

  const onBackingPause = useCallback(() => {
    setBackingPlaying(false);
    guideVocalRef.current?.pause();
  }, []);

  // Auto-stop the take when the backing track ends.
  const onBackingEnded = useCallback(() => {
    setBackingPlaying(false);
    setIsPreviewing(false);
    guideVocalRef.current?.pause();
    if (recorder.isRecording) recorder.stop();
  }, [recorder]);

  // Preview vocal + backing together from the top (guide stays muted during preview).
  const previewTake = useCallback(async () => {
    const a = backingRef.current;
    const v = vocalPlaybackRef.current;
    if (!a || !v) return;
    setIsPreviewing(true);
    a.currentTime = 0;
    v.currentTime = 0;
    try {
      await Promise.all([a.play(), v.play()]);
    } catch {
      setIsPreviewing(false);
      toast({ title: "Couldn't start preview", variant: "destructive" });
    }
  }, [toast]);

  const stopPreview = useCallback(() => {
    setIsPreviewing(false);
    backingRef.current?.pause();
    vocalPlaybackRef.current?.pause();
    guideVocalRef.current?.pause();
  }, []);

  const mixAndExport = useCallback(async () => {
    if (!backingFile || !recorder.vocalBlob) return;
    setMixing(true);
    try {
      const vocalFile = await blobToUploadFile(recorder.vocalBlob, "vocal-booth-take");
      const form = new FormData();
      form.append("tracks", backingFile, backingFile.name);
      form.append("tracks", vocalFile, vocalFile.name);
      form.append("arrangement", "layer");
      const r = await fetch("/api/kernel/studio-mix", { method: "POST", body: form, credentials: "include" });
      if (r.status === 403) {
        toast({ title: "Pro required", description: "Mixing down is a GravelKing Pro feature.", variant: "destructive" });
        return;
      }
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        toast({ title: "Mixdown failed", description: txt.slice(0, 140) || `Server returned ${r.status}`, variant: "destructive" });
        return;
      }
      const blob = await r.blob();
      downloadBlob(blob, "gravelking_vocal_booth_mix.wav");
      toast({ title: "Mix exported", description: "Your vocal + backing mix was saved." });
    } catch (e) {
      toast({ title: "Mixdown failed", description: (e as { message?: string })?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setMixing(false);
    }
  }, [backingFile, recorder.vocalBlob, toast]);

  const meterPct = Math.round(recorder.level * 100);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-2 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Mic className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">Vocal Booth</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Sing over a track, record, mix down</p>
            </div>
            <ToolHelp
              title="Vocal Booth"
              summary="Sing over a backing track with a scrolling teleprompter, record your take, and mix it down with the instrumental."
              steps={[
                "Load a backing track, or split one of your own songs into instrumental + guide vocal.",
                "Paste or pick lyrics; toggle the guide vocal to hear the melody.",
                "Record your take, then mix down to instrumental + your vocal.",
              ]}
              note="Lyric highlighting is energy-based and approximate (no transcription). The mixdown contains only the instrumental and your recorded vocal — never the guide vocal."
            />
          </div>
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Studio</Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* ── Left: lyrics ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="w-4 h-4 text-amber-500" /> Lyrics
            </div>

            {/* Song picker */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">From your library</div>
              {songsLoading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
              ) : songs.length === 0 ? (
                <div className="text-xs text-muted-foreground">No saved songs yet. Paste lyrics below, or write some in the <a href="/songwriting" className="text-amber-500 underline">Songwriting Studio</a>.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {songs.map((s) => {
                    const title = (s.storyPrompt?.slice(0, 28) || s.genre || "Untitled").trim();
                    const active = lyricSource === s.draftId;
                    return (
                      <button
                        key={s.draftId}
                        onClick={() => pickSong(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-amber-500 text-black border-amber-500" : "border-border/50 text-muted-foreground hover:border-amber-500/40 hover:text-white"}`}
                      >
                        {title}{title.length >= 28 ? "…" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* lrclib lyrics search */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Search lrclib.net</div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={lrcQuery}
                  onChange={(e) => setLrcQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void searchLrclib(); }}
                  placeholder="Artist · Song name"
                  className="flex-1 rounded-lg bg-black/40 border border-border/40 px-3 py-1.5 text-xs text-white/90 placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/40"
                />
                <button
                  onClick={() => void searchLrclib()}
                  disabled={lrcSearching || !lrcQuery.trim()}
                  className="rounded-lg bg-amber-500 hover:bg-amber-600 text-black px-3 py-1.5 text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                >
                  {lrcSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </button>
              </div>
              {lrcResults !== null && (
                lrcResults.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No results found.</p>
                ) : (
                  <ul className="space-y-0.5 max-h-44 overflow-y-auto">
                    {lrcResults.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => pickLrcTrack(t)}
                          className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-white/5 transition-colors"
                        >
                          <div className="text-xs font-medium text-white/90 truncate">{t.trackName}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {t.artistName}{t.albumName ? ` · ${t.albumName}` : ""}
                            {t.syncedLyrics && <span className="text-amber-500 ml-1">· synced</span>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {/* Auto-time lyrics to the guide vocal (energy-based, approximate) */}
            {guideVocalUrl && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <span className="text-[11px] text-muted-foreground leading-snug">
                  {timedLines
                    ? timingSource === "lrc"
                      ? "Precise synced timing from lrclib.net."
                      : "Lyrics timed to the guide vocal — energy-based & approximate."
                    : "Time your lyric lines to the guide vocal (approximate)."}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 shrink-0"
                  disabled={timing || !lyrics.trim()}
                  onClick={() => guideVocalBlob && runTiming(guideVocalBlob, lyrics)}
                >
                  {timing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {timedLines ? "Re-time" : "Auto-time"}
                </Button>
              </div>
            )}

            {/* Editable lyrics / teleprompter */}
            {recorder.isRecording || backingPlaying ? (
              <div
                ref={teleprompterRef}
                className="rounded-xl border border-amber-500/30 bg-black/40 p-4 h-[320px] overflow-y-auto scroll-smooth"
              >
                {lyrics.trim() ? (
                  lyricLines.map((line, i) => {
                    const isSection = line.trim().startsWith("[");
                    const isActive = i === activeLineIdx;
                    return (
                      <p
                        key={i}
                        ref={(el) => { lineRefs.current[i] = el; }}
                        className={`text-lg leading-relaxed transition-colors ${
                          isActive
                            ? "text-amber-300 font-semibold"
                            : isSection
                              ? "text-amber-400/80 font-semibold mt-3"
                              : timedLines
                                ? "text-white/40"
                                : "text-white/90"
                        }`}
                      >
                        {line || "\u00A0"}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-sm">No lyrics loaded — add some to follow along.</p>
                )}
              </div>
            ) : (
              <textarea
                value={lyrics}
                onChange={(e) => { setLyrics(e.target.value); if (timedLines) { setTimedLines(null); setTimingSource(null); } }}
                placeholder="Paste or pick lyrics here. Section markers like [Verse] / [Chorus] are highlighted while you sing."
                className="w-full h-[320px] rounded-xl border border-border/40 bg-black/40 p-4 text-sm text-white/90 resize-none focus:outline-none focus:border-amber-500/40 font-mono"
              />
            )}
          </div>

          {/* ── Right: booth ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Music className="w-4 h-4 text-amber-500" /> Backing Track
            </div>

            {/* Backing upload + transport */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.weba,.aiff,.au,.snd,.wma"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
                onChange={(e) => { handleFile(e.target.files?.[0] ?? null); if (e.target) e.target.value = ""; }}
              />
              <input
                ref={splitInputRef}
                type="file"
                accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.weba,.aiff,.au,.snd,.wma"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
                onChange={(e) => { handleSplitFile(e.target.files?.[0] ?? null); if (e.target) e.target.value = ""; }}
              />
              {!backingFile ? (
                splitting ? (
                  <div className="w-full flex flex-col items-center justify-center gap-2 py-8 text-amber-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Splitting your song…</span>
                    <span className="text-[10px] text-muted-foreground text-center px-4">Separating vocals from the instrumental — this can take a moment.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-border/30 text-muted-foreground hover:text-white hover:border-amber-500/40 transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      <span className="text-sm">Upload an instrumental</span>
                    </button>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <div className="h-px flex-1 bg-border/40" /> or <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <button
                      onClick={() => splitInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      <Scissors className="w-4 h-4" />
                      <span className="text-sm font-medium">Split your own song</span>
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                      Upload a full track — we'll split it into a backing instrumental plus an
                      approximate guide vocal to sing along to.
                    </p>
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/80 truncate flex items-center gap-1.5"><Music className="w-3 h-3 shrink-0 text-amber-500" />{backingFile.name}</span>
                    <button onClick={() => fileInputRef.current?.click()} className="text-[11px] text-amber-500 hover:underline shrink-0">Change</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleBacking}
                      disabled={recorder.isRecording}
                      className="w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-600 text-black flex items-center justify-center disabled:opacity-40 shrink-0"
                    >
                      {backingPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={progress}
                      onChange={(e) => seekBacking(parseFloat(e.target.value))}
                      disabled={recorder.isRecording}
                      className="flex-1 accent-amber-500"
                    />
                    <span className="text-[10px] font-mono text-muted-foreground w-16 text-right shrink-0">{fmtTime(position)} / {fmtTime(duration)}</span>
                  </div>
                  {guideVocalUrl && (
                    <div className="rounded-lg border border-border/40 bg-black/20 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-white/80 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-amber-500" /> Guide vocal
                        </span>
                        <button
                          onClick={() => setGuideEnabled((v) => !v)}
                          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${guideEnabled ? "border-amber-500/40 text-amber-400 bg-amber-500/10" : "border-border/50 text-muted-foreground"}`}
                        >
                          {guideEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                          {guideEnabled ? "On" : "Off"}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Extracted from your song (approximate — expect some bleed). Plays in sync with the
                        backing track; it's never added to your exported mix.
                      </p>
                    </div>
                  )}
                  <audio
                    ref={backingRef}
                    src={backingUrl ?? undefined}
                    onPlay={() => setBackingPlaying(true)}
                    onPause={onBackingPause}
                    onEnded={onBackingEnded}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  />
                  <audio ref={guideVocalRef} src={guideVocalUrl ?? undefined} preload="auto" />
                </>
              )}
            </div>

            {/* Recorder */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-4">
              {/* Live level meter */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Input level</span>
                  <span>{recorder.isRecording ? "LIVE" : "—"}</span>
                </div>
                <div className="h-2.5 rounded-full bg-black/50 overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-75 ${meterPct > 88 ? "bg-red-500" : meterPct > 60 ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${recorder.isRecording ? meterPct : 0}%` }}
                  />
                </div>
              </div>

              {/* Transport */}
              <div className="flex flex-col items-center gap-3">
                {!recorder.isRecording && recorder.status !== "recorded" && (
                  <button
                    onClick={startTake}
                    disabled={!backingFile}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center disabled:opacity-40 transition-colors shadow-lg shadow-red-500/20"
                    title={backingFile ? "Start recording" : "Add a backing track first"}
                  >
                    <Mic className="w-7 h-7" />
                  </button>
                )}
                {recorder.isRecording && (
                  <button
                    onClick={stopTake}
                    className="w-16 h-16 rounded-full bg-white text-red-600 flex items-center justify-center animate-pulse"
                    title="Stop recording"
                  >
                    <Square className="w-6 h-6 fill-current" />
                  </button>
                )}
                <div className="text-xs text-muted-foreground text-center">
                  {recorder.isRecording
                    ? "Recording — sing along, lyrics are scrolling"
                    : recorder.status === "recorded"
                      ? "Take captured"
                      : backingFile
                        ? "Hit record to sing over the track"
                        : "Upload a backing track to begin"}
                </div>
              </div>

              {/* Recorded take actions */}
              {recorder.status === "recorded" && recorder.vocalUrl && (
                <div className="space-y-3 pt-1">
                  <audio ref={vocalPlaybackRef} src={recorder.vocalUrl} onEnded={stopPreview} />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={previewTake} size="sm" variant="secondary" className="gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Preview with track
                    </Button>
                    <Button onClick={stopPreview} size="sm" variant="ghost" className="gap-1.5">
                      <Pause className="w-3.5 h-3.5" /> Stop
                    </Button>
                    <Button onClick={() => { stopPreview(); recorder.reset(); }} size="sm" variant="ghost" className="gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Re-record
                    </Button>
                  </div>
                  <Button
                    onClick={mixAndExport}
                    disabled={mixing}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
                  >
                    {mixing ? <><Loader2 className="w-4 h-4 animate-spin" /> Mixing…</> : <><Download className="w-4 h-4" /> Mix &amp; Export</>}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">Vocal + backing are layered and carved through the Morris Law kernel.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
