import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { useAppState } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square, Play, Pause, Upload, Download, Music, FileText, RotateCcw, Loader2, Scissors, Volume2, VolumeX, Sparkles, Wand2, Search, Maximize2, Minimize2, Clock } from "lucide-react";
import { useVocalBoothRecorder, blobToUploadFile } from "@/lib/daw/useVocalBoothRecorder";
import { splitSong, analyzeGuideTiming, SplitError, type TimedLine } from "@/lib/daw/stemTiming";
import { searchLyrics, parseLrc, type LrclibTrack } from "@/lib/lrclib";
import { downloadBlob } from "@/lib/download";
import { LiveVocalMonitor } from "@/components/live-vocal-monitor";

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

// ── Waveform helpers (module-scope, stable references) ───────────────────────

/**
 * Decode a File's audio data and compute RMS peak values per bucket.
 * Returns a Float32Array of `buckets` values in [0, 1].
 */
function computeWaveformPeaks(file: File, buckets: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    file.arrayBuffer().then((raw) => {
      // Slice to transfer ownership safely; AudioContext.decodeAudioData detaches the buffer.
      const copy = raw.slice(0);
      const ctx = new AudioContext();
      ctx.decodeAudioData(copy, (decoded) => {
        ctx.close();
        const ch = decoded.getChannelData(0);
        const peaks = new Float32Array(buckets);
        const chunkSize = Math.floor(ch.length / buckets);
        for (let i = 0; i < buckets; i++) {
          let sum = 0;
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, ch.length);
          for (let j = start; j < end; j++) {
            const v = ch[j] ?? 0;
            sum += v * v;
          }
          peaks[i] = Math.sqrt(sum / Math.max(1, end - start));
        }
        resolve(peaks);
      }, reject);
    }, reject);
  });
}

/**
 * Draw the BandLab-style scrolling waveform on the canvas.
 * Works in canvas pixel coordinates (canvas.width × canvas.height).
 *
 * Top section: pre-computed timeline waveform (faded past, bright amber runway ahead).
 * Bottom strip: live AnalyserNode time-domain data (if analyser is connected).
 */
function drawBoothWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array | null,
  totalDuration: number,
  currentTimeSec: number,
  analyser: AnalyserNode | null,
): void {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;

  const W = canvas.width;
  const H = canvas.height;

  ctx2d.clearRect(0, 0, W, H);
  ctx2d.fillStyle = "#0a0a0a";
  ctx2d.fillRect(0, 0, W, H);

  if (!peaks || totalDuration <= 0) {
    // No track — draw a faint center line
    ctx2d.fillStyle = "rgba(255,255,255,0.06)";
    ctx2d.fillRect(0, H * 0.5 - 1, W, 2);
    return;
  }

  const hasLive = analyser !== null;
  const waveH = hasLive ? H * 0.68 : H * 0.86;
  const midY = waveH / 2;

  // Scrolling window: 24 s of audio visible on canvas
  const windowSec = Math.min(totalDuration, 24);
  const PLAYHEAD_X = W * 0.28;          // playhead at 28% from left
  const secPerPx = windowSec / W;
  const peaksPerSec = peaks.length / totalDuration;
  const startT = currentTimeSec - PLAYHEAD_X * secPerPx;

  // ── Pre-computed waveform bars ─────────────────────────────────────────────
  for (let x = 0; x < W; x++) {
    const t = startT + x * secPerPx;
    if (t < 0 || t > totalDuration) continue;
    const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor(t * peaksPerSec)));
    const peak = peaks[idx] ?? 0;
    const barH = Math.max(1.5, peak * waveH * 0.88);
    ctx2d.fillStyle = t <= currentTimeSec ? "rgba(245,158,11,0.22)" : "rgba(245,158,11,0.82)";
    ctx2d.fillRect(x, midY - barH / 2, 1, barH);
  }

  // Playhead soft glow
  const grd = ctx2d.createLinearGradient(PLAYHEAD_X - 28, 0, PLAYHEAD_X + 28, 0);
  grd.addColorStop(0, "rgba(245,158,11,0)");
  grd.addColorStop(0.5, "rgba(245,158,11,0.14)");
  grd.addColorStop(1, "rgba(245,158,11,0)");
  ctx2d.fillStyle = grd;
  ctx2d.fillRect(PLAYHEAD_X - 28, 0, 56, waveH);

  // Playhead line
  ctx2d.strokeStyle = "#f59e0b";
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(PLAYHEAD_X, 6);
  ctx2d.lineTo(PLAYHEAD_X, waveH - 6);
  ctx2d.stroke();

  // "NOW" label at playhead
  ctx2d.font = `${Math.round(W * 0.0055)}px monospace`;
  ctx2d.fillStyle = "#f59e0b";
  ctx2d.fillText("NOW", PLAYHEAD_X + 5, 18);

  // Time ticks
  const tickStep = windowSec >= 20 ? 10 : 5;
  const firstTick = Math.ceil(startT / tickStep) * tickStep;
  ctx2d.font = `${Math.round(W * 0.005)}px monospace`;
  for (let s = firstTick; s <= startT + windowSec; s += tickStep) {
    if (s < 0 || s > totalDuration) continue;
    const tx = (s - startT) / secPerPx;
    ctx2d.fillStyle = s <= currentTimeSec ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.38)";
    ctx2d.fillRect(tx, waveH - 12, 1.5, 12);
    if (tx > 30 && tx < W - 30) {
      ctx2d.fillText(fmtTime(s), tx + 4, waveH - 1);
    }
  }

  // ── Live AnalyserNode strip ─────────────────────────────────────────────────
  if (hasLive) {
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(data);

    const sTop = waveH + 8;
    const sH = H - sTop - 4;
    const sMid = sTop + sH / 2;

    ctx2d.fillStyle = "rgba(245,158,11,0.04)";
    ctx2d.fillRect(0, sTop, W, sH);

    ctx2d.strokeStyle = "rgba(251,191,36,0.65)";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    for (let i = 0; i < bufLen; i++) {
      const x = (i / (bufLen - 1)) * W;
      const norm = ((data[i] ?? 128) - 128) / 128;
      const y = sMid + norm * (sH / 2 - 2);
      if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
    }
    ctx2d.stroke();

    ctx2d.font = `${Math.round(W * 0.0042)}px monospace`;
    ctx2d.fillStyle = "rgba(255,255,255,0.22)";
    ctx2d.fillText("LIVE", 6, sTop + 14);
  }
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
  const [transcribing, setTranscribing] = useState(false);
  const [tapTimingActive, setTapTimingActive] = useState(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);

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

  // ── enlarged studio + waveform state ────────────────────────────────────────
  const [enlarged, setEnlarged] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const guideAudible = guideEnabled && !isPreviewing && !!guideVocalUrl;

  const lyricLines = lyrics.split("\n");
  const timableLines = lyricLines
    .map((text, idx) => ({ text, idx }))
    .filter(({ text }) => text.trim() && !text.trim().startsWith("["));
  const tapTimingLineIdx = tapTimes.length;
  const tapTimingDone = tapTimingLineIdx >= timableLines.length && timableLines.length > 0;

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

  // Decode backing audio → pre-compute waveform peaks for the BandLab canvas.
  useEffect(() => {
    if (!backingFile) { setWaveformPeaks(null); return; }
    let cancelled = false;
    computeWaveformPeaks(backingFile, 2000)
      .then((p) => { if (!cancelled) setWaveformPeaks(p); })
      .catch(() => { /* non-fatal — canvas shows flat line */ });
    return () => { cancelled = true; };
  }, [backingFile]);

  // Run the BandLab canvas draw loop while the studio is enlarged.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enlarged || !canvas) return;
    let rafId: number;
    const draw = () => {
      const t = backingRef.current?.currentTime ?? 0;
      drawBoothWaveform(canvas, waveformPeaks, duration, t, analyserRef.current);
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enlarged, waveformPeaks, duration]);

  // Close enlarged mode on Escape.
  useEffect(() => {
    if (!enlarged) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setEnlarged(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enlarged]);

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

  // ── Whisper transcription ──────────────────────────────────────────────────
  // Pass a blob override to transcribe a specific audio blob immediately
  // (e.g. right after a split before React state has updated).
  // Falls back to guideVocalBlob (split vocals) then backingFile.
  const transcribeVocals = useCallback(async (overrideBlob?: Blob | File | null) => {
    const target: Blob | File | null = overrideBlob ?? guideVocalBlob ?? backingFile;
    if (!target) return;
    setTranscribing(true);
    try {
      const fd = new FormData();
      const filename = target instanceof File ? target.name : "vocals.wav";
      fd.append("audio", target, filename);
      const r = await fetch("/api/audio/transcribe", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Transcription failed");
      }
      const data = (await r.json()) as {
        segments: Array<{ text: string; start: number; end: number }>;
        fullText: string;
      };
      if (!data.segments || data.segments.length === 0) {
        toast({
          title: "No clear vocals detected",
          description: "Use Tap-to-Time below to sync your lyrics by ear.",
        });
        return;
      }
      // Group Whisper segments into lyric lines (new line on 1 s+ gap or 55+ chars).
      const lines: string[] = [];
      const times: TimedLine[] = [];
      let currentLine = "";
      let lineStartTime = data.segments[0]?.start ?? 0;
      let prevEnd = 0;
      for (const seg of data.segments) {
        const text = seg.text.trim();
        if (!text) continue;
        const gap = prevEnd ? seg.start - prevEnd : 0;
        if (currentLine && (gap > 1.0 || currentLine.length + text.length > 55)) {
          lines.push(currentLine.trim());
          times.push({ idx: lines.length - 1, t: lineStartTime });
          currentLine = text;
          lineStartTime = seg.start;
        } else {
          currentLine = currentLine ? `${currentLine} ${text}` : text;
        }
        prevEnd = seg.end;
      }
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
        times.push({ idx: lines.length - 1, t: lineStartTime });
      }
      setLyrics(lines.join("\n"));
      setTimedLines(times);
      setTimingSource("lrc");
      setLyricSource("whisper");
      toast({
        title: "Vocals transcribed!",
        description: `${lines.length} lines detected with precise timing.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Auto-transcribe unavailable",
        description:
          (err as { message?: string })?.message ??
          "Use Tap-to-Time below to sync your lyrics by ear.",
      });
    } finally {
      setTranscribing(false);
    }
  }, [guideVocalBlob, backingFile, toast]);

  // ── Tap-to-time ────────────────────────────────────────────────────────────
  const startTapTiming = useCallback(() => {
    setTapTimingActive(true);
    setTapTimes([]);
    setTimedLines(null);
    setTimingSource(null);
    toast({ title: "Tap timing started", description: "Play the track and tap when each line begins." });
  }, [toast]);

  const handleTapTime = useCallback(() => {
    const t = backingRef.current?.currentTime ?? 0;
    setTapTimes((prev) => {
      const newTimes = [...prev, t];
      const linesAll = lyrics.split("\n");
      const timable = linesAll
        .map((text, idx) => ({ text, idx }))
        .filter(({ text }) => text.trim() && !text.trim().startsWith("["));
      if (newTimes.length >= timable.length) {
        const tl: TimedLine[] = timable.map((l, i) => ({ idx: l.idx, t: newTimes[i] ?? 0 }));
        setTimedLines(tl);
        setTimingSource("lrc");
        setTapTimingActive(false);
        toast({ title: "Timing locked!", description: `${tl.length} lines timed.` });
      }
      return newTimes;
    });
  }, [lyrics, toast]);

  const cancelTapTiming = useCallback(() => {
    setTapTimingActive(false);
    setTapTimes([]);
  }, []);

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
      toast({ title: "Song split", description: "Instrumental loaded as backing track; transcribing vocals…" });
      // Run energy-timing AND Whisper transcription in parallel on the vocal stem.
      // Pass vocals directly — React state hasn't updated yet at this point.
      void runTiming(vocals, lyrics);
      void transcribeVocals(vocals);
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

  // Wire the backing <audio> element through an AudioContext + AnalyserNode so the
  // BandLab canvas can read live waveform data.  Must be called inside a user-gesture
  // handler (play/record button) — iOS/Safari only resumes the context in gestures.
  const setupAudioGraph = useCallback(() => {
    if (audioCtxRef.current) {
      // Context already exists; just make sure it isn't suspended.
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume().catch(() => {});
      }
      return;
    }
    const a = backingRef.current;
    if (!a) return;
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(a);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch { /* Web Audio unavailable — waveform live-strip stays hidden */ }
  }, []);

  const toggleBacking = useCallback(async () => {
    const a = backingRef.current;
    if (!a) return;
    setupAudioGraph();
    if (a.paused) {
      // Start backing + guide together, no awaits in between (autoplay guard).
      const guidePlay = startGuide();
      await Promise.allSettled([a.play(), guidePlay ?? Promise.resolve()]);
    } else {
      a.pause();
    }
  }, [setupAudioGraph, startGuide]);

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
    setupAudioGraph();
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
  }, [backingFile, setupAudioGraph, recorder, startGuide, toast]);

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

            {/* ── Whisper auto-transcription ── */}
            {(backingFile || guideVocalBlob) && (
              <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Auto-transcribe vocals</div>
                {guideVocalBlob ? (
                  /* After a split: transcribe the extracted vocal stem */
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {transcribing
                        ? "Transcribing the extracted vocals — lyrics and timing will appear automatically."
                        : timingSource === "lrc" && lyricSource === "whisper"
                          ? "Lyrics and timing auto-detected from the extracted vocal stem."
                          : "Transcribe the extracted vocal stem to get timed lyrics automatically."}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 shrink-0"
                      disabled={transcribing}
                      onClick={() => void transcribeVocals()}
                    >
                      {transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {transcribing ? "Transcribing…" : timedLines && lyricSource === "whisper" ? "Re-transcribe" : "Transcribe Vocals"}
                    </Button>
                  </div>
                ) : (
                  /* No split done: let the user upload a separate vocals file */
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Upload a vocals-only file (a cappella, isolated vocal stem) to auto-detect lyrics with precise timestamps.
                      Or, split your full song above to extract vocals automatically.
                    </p>
                    <label className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border/40 text-xs text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.weba"
                        className="sr-only"
                        disabled={transcribing}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void transcribeVocals(f);
                          if (e.target) e.target.value = "";
                        }}
                      />
                      {transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {transcribing ? "Transcribing…" : "Upload vocals to transcribe"}
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Auto-time lyrics to the guide vocal (energy-based, approximate) */}
            {guideVocalUrl && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <span className="text-[11px] text-muted-foreground leading-snug">
                  {timedLines
                    ? timingSource === "lrc"
                      ? lyricSource === "whisper"
                        ? "Precise timing auto-detected via Whisper."
                        : "Precise synced timing from lrclib.net."
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

            {/* Editable lyrics / teleprompter — hidden in enlarged mode (overlay owns the ref) */}
            {enlarged ? null : recorder.isRecording || backingPlaying ? (
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

            {/* ── Tap-to-time: manually stamp each lyric line while playing ── */}
            {!tapTimingActive ? (
              !timedLines && lyrics.trim() && (
                <button
                  onClick={startTapTiming}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border/40 text-xs text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" /> Tap to time lyrics while playing
                </button>
              )
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-400">
                    Line {Math.min(tapTimingLineIdx + 1, timableLines.length)} of {timableLines.length}
                  </span>
                  <button onClick={cancelTapTiming} className="text-xs text-muted-foreground hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
                {!tapTimingDone && (
                  <p className="text-sm font-mono text-white/90 bg-black/30 rounded px-2 py-1 truncate">
                    {timableLines[tapTimingLineIdx]?.text ?? ""}
                  </p>
                )}
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-base h-12"
                  onClick={handleTapTime}
                  disabled={tapTimingDone || !backingPlaying}
                >
                  {tapTimingDone ? "✓ All lines timed" : "▶ Now"}
                </Button>
                {!backingPlaying && !tapTimingDone && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Play the track first, then tap ▶ Now each time a lyric line begins.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Right: booth ── */}
          <div className="space-y-3">
            {/* Header — single-click OR Maximize2 button both enter Studio Mode */}
            <div
              className="flex items-center gap-2 text-sm font-semibold cursor-pointer hover:text-amber-400 transition-colors select-none"
              onClick={() => setEnlarged(true)}
              title="Click to enter Studio Mode"
            >
              <Music className="w-4 h-4 text-amber-500" /> Backing Track
              <button
                onClick={(e) => { e.stopPropagation(); setEnlarged(true); }}
                className="ml-auto p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-amber-400"
                title="Enlarge Studio (Maximize)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Backing upload + transport — double-click anywhere to enlarge */}
            <div
              className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-3"
              onDoubleClick={() => setEnlarged(true)}
              title="Double-click to enter Studio Mode"
            >
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
                    <span className="text-[10px] text-muted-foreground text-center px-4">Separating vocals from the instrumental — this usually takes 30–90 seconds. Please keep this page open.</span>
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

            {/* ── Live Vocal Monitoring — hear yourself through reverb/echo presets ── */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Live Monitoring</div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Pick a preset to hear your voice live through effects while you sing. Tap again to stop.
              </p>
              <LiveVocalMonitor />
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

      {/* ══ Enlarged Studio Mode — fixed fullscreen overlay ══════════════════════
          Audio elements remain in the normal DOM above (never remounted), so
          playback and the AudioContext graph survive the transition with zero gap. */}
      {enlarged && (
        <div className="fixed inset-0 z-50 bg-[#080808] flex flex-col overflow-hidden">

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Mic className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <span className="text-sm font-semibold shrink-0">Studio Mode</span>
              {backingFile && (
                <span className="text-[11px] text-muted-foreground truncate">{backingFile.name}</span>
              )}
            </div>
            <button
              onClick={() => setEnlarged(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0 ml-3"
              title="Exit Studio Mode (Esc)"
            >
              <Minimize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* BandLab waveform canvas
              2400 × 260 native pixels displayed at CSS height 130 px → crisp on HiDPI.
              The rAF loop above writes to this canvas every frame while enlarged. */}
          <div className="px-3 pt-2.5 pb-1 shrink-0">
            <canvas
              ref={canvasRef}
              width={2400}
              height={260}
              className="w-full rounded-xl block"
              style={{ height: 130 }}
            />
            {!backingFile && (
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                Load a backing track to see the waveform timeline.
              </p>
            )}
            {backingFile && !waveformPeaks && (
              <p className="text-[10px] text-muted-foreground text-center mt-1 flex items-center justify-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Decoding waveform…
              </p>
            )}
          </div>

          {/* Transport controls */}
          <div className="px-4 py-2.5 border-b border-white/10 shrink-0 flex items-center gap-3">
            <button
              onClick={toggleBacking}
              disabled={!backingFile || recorder.isRecording}
              className="w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-600 text-black flex items-center justify-center disabled:opacity-40 shrink-0"
              title={backingFile ? "Play / Pause" : "Load a track first"}
            >
              {backingPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.001} value={progress}
              onChange={(e) => seekBacking(parseFloat(e.target.value))}
              disabled={recorder.isRecording}
              className="flex-1 accent-amber-500"
            />
            <span className="text-[11px] font-mono text-muted-foreground w-20 text-right shrink-0">
              {fmtTime(position)} / {fmtTime(duration)}
            </span>
            {guideVocalUrl && (
              <button
                onClick={() => setGuideEnabled((v) => !v)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors shrink-0 ${guideEnabled ? "border-amber-500/40 text-amber-400 bg-amber-500/10" : "border-border/50 text-muted-foreground"}`}
              >
                {guideEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                Guide
              </button>
            )}
          </div>

          {/* Level meter + record button row */}
          <div className="px-4 py-2 shrink-0 flex items-center gap-4 border-b border-white/10">
            <div className="flex-1 space-y-0.5 min-w-0">
              <div className="h-1.5 rounded-full bg-black/60 overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-75 ${meterPct > 88 ? "bg-red-500" : meterPct > 60 ? "bg-amber-400" : "bg-emerald-500"}`}
                  style={{ width: `${recorder.isRecording ? meterPct : 0}%` }}
                />
              </div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                {recorder.isRecording ? "● Recording — sing along" : "Input level"}
              </div>
            </div>
            {!recorder.isRecording && recorder.status !== "recorded" && (
              <button
                onClick={startTake}
                disabled={!backingFile}
                className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center disabled:opacity-40 shadow-lg shadow-red-500/30 shrink-0"
                title={backingFile ? "Start recording" : "Load a track first"}
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
            {recorder.isRecording && (
              <button
                onClick={stopTake}
                className="w-12 h-12 rounded-full bg-white text-red-600 flex items-center justify-center animate-pulse shrink-0"
                title="Stop recording"
              >
                <Square className="w-5 h-5 fill-current" />
              </button>
            )}
          </div>

          {/* Post-take actions */}
          {recorder.status === "recorded" && recorder.vocalUrl && (
            <div className="px-4 py-2 shrink-0 flex flex-wrap items-center gap-2 border-b border-white/10">
              <Button onClick={previewTake} size="sm" variant="secondary" className="gap-1.5">
                <Play className="w-3.5 h-3.5" /> Preview
              </Button>
              <Button onClick={stopPreview} size="sm" variant="ghost" className="gap-1.5">
                <Pause className="w-3.5 h-3.5" /> Stop
              </Button>
              <Button onClick={() => { stopPreview(); recorder.reset(); }} size="sm" variant="ghost" className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Re-record
              </Button>
              <Button
                onClick={mixAndExport}
                disabled={mixing}
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2 ml-auto"
              >
                {mixing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mixing…</>
                  : <><Download className="w-3.5 h-3.5" /> Mix &amp; Export</>}
              </Button>
            </div>
          )}

          {/* Full-screen teleprompter — this owns teleprompterRef + lineRefs while enlarged */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 pt-2">
            {timedLines && (
              <div className="px-5 pb-1 shrink-0">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                  {timingSource === "lrc"
                    ? "Precise synced timing · lrclib.net"
                    : "Energy-based · approximate"}
                </span>
              </div>
            )}
            <div
              ref={teleprompterRef}
              className="flex-1 overflow-y-auto scroll-smooth px-6 pb-8"
            >
              {lyrics.trim() ? (
                lyricLines.map((line, i) => {
                  const isSection = line.trim().startsWith("[");
                  const isActive = i === activeLineIdx;
                  return (
                    <p
                      key={i}
                      ref={(el) => { lineRefs.current[i] = el; }}
                      className={`text-center leading-loose transition-all duration-150 ${
                        isActive
                          ? "text-amber-300 font-bold text-4xl py-2"
                          : isSection
                            ? "text-amber-400/50 font-semibold text-sm mt-5"
                            : timedLines
                              ? "text-white/25 text-2xl py-0.5"
                              : "text-white/70 text-2xl py-0.5"
                      }`}
                    >
                      {line || "\u00A0"}
                    </p>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-sm text-center mt-16">
                  No lyrics loaded — add them in the normal view then re-enter Studio Mode.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
