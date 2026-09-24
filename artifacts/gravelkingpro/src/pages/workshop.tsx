import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Check, FileAudio, Library, Loader2, Pause, Play, RotateCcw, Save, Search, ShieldCheck, Upload, Volume2, VolumeX } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { LyricTimer, type LyricTiming, type SyncedLyric } from "@/components/prompter/LyricTimer";
import { parseLrcSeconds, searchLyrics, type LrclibTrack } from "@/lib/lrclib";
import { saveStageCatalogEntry } from "@/lib/stage-catalog";
import { useLocation } from "wouter";
import { Rocket } from "lucide-react";

type AudioSlot = {
  file: File;
  buffer: AudioBuffer;
  duration: number;
};

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

const MIN_GUIDE_OFFSET = -15;
const MAX_GUIDE_OFFSET = 15;
const INITIAL_INSTRUMENTAL_LEVEL = 35;
const INITIAL_GUIDE_LEVEL = 40;

type MixerSettings = {
  instrumentalLevel: number;
  guideLevel: number;
  instrumentalMute: boolean;
  guideMute: boolean;
  instrumentalSolo: boolean;
  guideSolo: boolean;
};

function levelToDb(level: number): number {
  if (level <= 0) return -Infinity;
  return 20 * Math.log10(level / 100);
}

function formatDb(level: number): string {
  if (level <= 0) return "−∞ dB";
  return `${Math.round(levelToDb(level))} dB`;
}

function formatSignedOffset(seconds: number): string {
  return `${seconds >= 0 ? "+" : ""}${seconds.toFixed(3)}s`;
}

export default function WorkshopPage() {
  return (
    <Layout>
      <WorkshopEditor />
    </Layout>
  );
}

export function WorkshopPanel() {
  return <WorkshopEditor embedded />;
}

function WorkshopEditor({ embedded = false }: { embedded?: boolean }) {
  const [instrumental, setInstrumental] = useState<AudioSlot | null>(null);
  const [guideVocal, setGuideVocal] = useState<AudioSlot | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [timings, setTimings] = useState<LyricTiming[]>([]);
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLyric[]>([]);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [guideOffset, setGuideOffset] = useState(0);
  const [mixer, setMixer] = useState<MixerSettings>({
    instrumentalLevel: INITIAL_INSTRUMENTAL_LEVEL,
    guideLevel: INITIAL_GUIDE_LEVEL,
    instrumentalMute: false,
    guideMute: false,
    instrumentalSolo: false,
    guideSolo: false,
  });
  const [loadingSlot, setLoadingSlot] = useState<"instrumental" | "guide" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [lrcQuery, setLrcQuery] = useState("");
  const [lrcResults, setLrcResults] = useState<LrclibTrack[] | null>(null);
  const [lrcSearching, setLrcSearching] = useState(false);
  const [, setLocation] = useLocation();

  const audioContextRef = useRef<AudioContext | null>(null);
  const instrumentalSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const guideSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scheduledAtRef = useRef(0);
  const offsetAtStartRef = useRef(0);
  const playbackPositionRef = useRef(0);
  const guideOffsetRef = useRef(0);
  const mixerRef = useRef<MixerSettings>(mixer);
  const mixerNodesRef = useRef<{
    instrumentalGain: GainNode;
    guideGain: GainNode;
  } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);

  const lines = useMemo(() => lyrics.split("\n"), [lyrics]);
  const nextLineIndex = timings.length;
  const duration = instrumental?.duration ?? 0;
  const progress = duration > 0 ? Math.min(1, playbackPosition / duration) : 0;
  const timingComplete = lines.length > 0 && nextLineIndex >= lines.length;

  const ensureAudioContext = useCallback(() => {
    const ExistingContext = getAudioContextConstructor();
    if (!ExistingContext) throw new Error("Web Audio is not available in this browser.");
    if (!audioContextRef.current) {
      audioContextRef.current = new ExistingContext({ latencyHint: "interactive" });
    }
    return audioContextRef.current;
  }, []);

  const stopSources = useCallback((resetPosition: boolean) => {
    playbackTokenRef.current += 1;
    for (const sourceRef of [instrumentalSourceRef, guideSourceRef]) {
      try { sourceRef.current?.stop(); } catch { /* already stopped */ }
      sourceRef.current?.disconnect();
      sourceRef.current = null;
    }
    mixerNodesRef.current?.instrumentalGain.disconnect();
    mixerNodesRef.current?.guideGain.disconnect();
    mixerNodesRef.current = null;
    if (resetPosition) {
      offsetAtStartRef.current = 0;
      playbackPositionRef.current = 0;
      setPlaybackPosition(0);
    }
    setIsPlaying(false);
  }, []);

  const applyMixer = useCallback(() => {
    const context = audioContextRef.current;
    const nodes = mixerNodesRef.current;
    if (!context || !nodes) return;
    const settings = mixerRef.current;
    const anySolo = settings.instrumentalSolo || settings.guideSolo;
    const instrumentalAudible = !settings.instrumentalMute && (!anySolo || settings.instrumentalSolo);
    const guideAudible = !settings.guideMute && (!anySolo || settings.guideSolo);
    nodes.instrumentalGain.gain.setTargetAtTime(
      instrumentalAudible ? settings.instrumentalLevel / 100 : 0,
      context.currentTime,
      0.01,
    );
    nodes.guideGain.gain.setTargetAtTime(
      guideAudible ? settings.guideLevel / 100 : 0,
      context.currentTime,
      0.01,
    );
  }, []);

  useEffect(() => {
    mixerRef.current = mixer;
    applyMixer();
  }, [applyMixer, mixer]);

  const currentPosition = useCallback((contextTime: number) => {
    if (!isPlaying) return playbackPositionRef.current;
    return Math.max(0, Math.min(duration, offsetAtStartRef.current + contextTime - scheduledAtRef.current));
  }, [duration, isPlaying]);

  const scheduleGuideSource = useCallback((context: AudioContext, position: number) => {
    const guideGain = mixerNodesRef.current?.guideGain;
    if (!guideGain || !guideVocal) return;

    try { guideSourceRef.current?.stop(); } catch { /* already stopped */ }
    guideSourceRef.current?.disconnect();
    guideSourceRef.current = null;

    const guideDelay = Math.max(0, guideOffsetRef.current - position);
    const guideAudioOffset = Math.max(0, position - guideOffsetRef.current);
    if (guideAudioOffset >= guideVocal.duration) return;

    const guideSource = context.createBufferSource();
    guideSource.buffer = guideVocal.buffer;
    guideSource.connect(guideGain);
    guideSource.start(context.currentTime + 0.06 + guideDelay, guideAudioOffset);
    guideSourceRef.current = guideSource;
  }, [guideVocal]);

  const scheduleSources = useCallback((context: AudioContext, position: number) => {
    if (!instrumental) return;
    const offset = Math.max(0, Math.min(instrumental.duration, position));
    const startAt = context.currentTime + 0.06;
    const token = playbackTokenRef.current;
    const masterGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const instrumentalGain = context.createGain();
    const guideGain = context.createGain();

    // Keep the master path protected before it reaches the hardware destination.
    limiter.threshold.value = -1;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    masterGain.gain.value = 0.95;
    instrumentalGain.connect(masterGain);
    guideGain.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(context.destination);
    mixerNodesRef.current = { instrumentalGain, guideGain };

    const backingSource = context.createBufferSource();
    backingSource.buffer = instrumental.buffer;
    backingSource.connect(instrumentalGain);
    backingSource.onended = () => {
      if (playbackTokenRef.current !== token) return;
      offsetAtStartRef.current = 0;
      playbackPositionRef.current = instrumental.duration;
      setPlaybackPosition(instrumental.duration);
      setIsPlaying(false);
    };
    backingSource.start(startAt, offset);
    instrumentalSourceRef.current = backingSource;

    scheduleGuideSource(context, offset);

    scheduledAtRef.current = startAt;
    offsetAtStartRef.current = offset;
    playbackPositionRef.current = offset;
    setPlaybackPosition(offset);
    setIsPlaying(true);
    applyMixer();
  }, [applyMixer, instrumental, scheduleGuideSource]);

  const pause = useCallback(() => {
    const context = audioContextRef.current;
    if (context && isPlaying) {
      const nextPosition = Math.max(0, Math.min(duration, offsetAtStartRef.current + context.currentTime - scheduledAtRef.current));
      offsetAtStartRef.current = nextPosition;
      playbackPositionRef.current = nextPosition;
      setPlaybackPosition(nextPosition);
    }
    stopSources(false);
  }, [duration, isPlaying, stopSources]);

  const play = useCallback(async () => {
    if (!instrumental) return;
    try {
      const context = ensureAudioContext();
      await context.resume();
      stopSources(false);
      scheduleSources(context, offsetAtStartRef.current);
    } catch (playbackError) {
      setError(playbackError instanceof Error ? playbackError.message : "Playback could not start.");
    }
  }, [ensureAudioContext, instrumental, scheduleSources, stopSources]);

  const nudgeGuide = useCallback((delta: number) => {
    const nextOffset = Math.max(
      MIN_GUIDE_OFFSET,
      Math.min(MAX_GUIDE_OFFSET, Math.round((guideOffsetRef.current + delta) * 1000) / 1000),
    );
    guideOffsetRef.current = nextOffset;
    setGuideOffset(nextOffset);
    setSaved(false);

    const context = audioContextRef.current;
    if (context && isPlaying && instrumental) {
      const position = currentPosition(context.currentTime);
      scheduleGuideSource(context, position);
    }
  }, [currentPosition, instrumental, isPlaying, scheduleGuideSource]);

  const resetGuideOffset = useCallback(() => {
    const delta = -guideOffsetRef.current;
    nudgeGuide(delta);
  }, [nudgeGuide]);

  const updateMixer = useCallback((patch: Partial<MixerSettings>) => {
    setMixer((current) => ({ ...current, ...patch }));
  }, []);

  const resetPlayback = useCallback(() => {
    stopSources(true);
  }, [stopSources]);

  const resetTimings = useCallback(() => {
    // Clear recorded timestamps only — the lyric text stays untouched.
    setTimings([]);
    setSyncedLyrics([]);
    setSaved(false);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      return;
    }
    const tick = () => {
      const context = audioContextRef.current;
      if (context && instrumental) {
        const nextPosition = currentPosition(context.currentTime);
        playbackPositionRef.current = nextPosition;
        setPlaybackPosition(nextPosition);
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [currentPosition, instrumental, isPlaying]);

  useEffect(() => () => {
    stopSources(false);
    void audioContextRef.current?.close();
  }, [stopSources]);

  const loadSlot = async (kind: "instrumental" | "guide", file: File | undefined) => {
    if (!file) return;
    setLoadingSlot(kind);
    setError("");
    try {
      const context = ensureAudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (kind === "instrumental") {
        stopSources(true);
        setInstrumental({ file, buffer, duration: buffer.duration });
        setTimings([]);
        setSaved(false);
      } else {
        setGuideVocal({ file, buffer, duration: buffer.duration });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Audio file could not be decoded.");
    } finally {
      setLoadingSlot(null);
    }
  };

  const updateLyrics = (value: string) => {
    setLyrics(value);
    setTimings([]);
    setSyncedLyrics([]);
    setSaved(false);
  };

  const searchLrclib = async () => {
    const query = lrcQuery.trim();
    if (!query) return;
    setLrcSearching(true);
    setLrcResults(null);
    setError("");
    try {
      setLrcResults((await searchLyrics(query)).slice(0, 8));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "LRCLIB search failed.");
    } finally {
      setLrcSearching(false);
    }
  };

  const selectLrclibTrack = (track: LrclibTrack) => {
    const parsed = track.syncedLyrics ? parseLrcSeconds(track.syncedLyrics) : [];
    const plain = track.plainLyrics?.trim() ?? "";
    const nextLyrics = parsed.length > 0 ? parsed.map((line) => line.text).join("\n") : plain;

    setLyrics(nextLyrics);
    setTimings([]);
    setSyncedLyrics(parsed);
    setLrcResults(null);
    setLrcQuery(`${track.artistName} · ${track.trackName}`);
    setSaved(false);
    setError(
      parsed.length > 0
        ? ""
        : nextLyrics
          ? "This result has no synced timestamps. Use the manual line-break spacebar timer below."
          : "This result has no lyrics. Enter or paste lyrics to use manual timing.",
    );
  };

  const captureTiming = (timing: LyricTiming) => {
    const context = audioContextRef.current;
    const timeSeconds = context
      ? Math.max(0, Math.min(duration, timing.contextTime - scheduledAtRef.current + offsetAtStartRef.current))
      : playbackPositionRef.current;
    setTimings((current) => [...current, { ...timing, timeSeconds }]);
    setSaved(false);
  };

  const saveCatalog = async (): Promise<string | null> => {
    const catalogTimings: LyricTiming[] = syncedLyrics.length > 0
      ? syncedLyrics.map((line, lineIndex) => ({
        lineIndex,
        contextTime: 0,
        timeSeconds: line.time,
      }))
      : timings;
    if (!instrumental) return null;
    setSaving(true);
    setError("");
    const entryId = crypto.randomUUID();
    try {
      const stageLines = catalogTimings.map((timing) => ({ ...timing, text: lines[timing.lineIndex] ?? "" }));
      await saveStageCatalogEntry({
        id: entryId,
        createdAt: new Date().toISOString(),
        title: instrumental.file.name.replace(/\.[^.]+$/, ""),
        instrumental: instrumental.file.slice(0, instrumental.file.size, instrumental.file.type),
        guideVocal: guideVocal
          ? guideVocal.file.slice(0, guideVocal.file.size, guideVocal.file.type)
          : null,
        lines: stageLines,
        syncedLyrics: stageLines,
        guideOffsetSeconds: guideOffset,
        durationSeconds: instrumental.duration,
        mixer: { ...mixer },
      });
      setSaved(true);
      return entryId;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Stage catalog entry could not be saved.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const takeToMainStage = async () => {
    const entryId = await saveCatalog();
    if (!entryId) return;
    stopSources(false);
    setLocation(`/main-stage?song=${encodeURIComponent(entryId)}`);
  };

  const timingSourceLabel = syncedLyrics.length > 0
    ? "LRCLIB · precise synced timing"
    : timings.length > 0
      ? "Manual spacebar timing"
      : "No timing loaded";

  return (
      <main className={`mx-auto max-w-6xl space-y-5 ${embedded ? "pb-8 pt-5" : "pb-28 pt-8"}`}>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300/75">Studio / Track Prep</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100 sm:text-4xl">Track &amp; Lyric Prep</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">
              Prepare the backing track and lyric timing before you perform. Nothing on this page changes the live Main Stage.
            </p>
          </div>
          <Badge variant="outline" className="border-amber-300/25 text-amber-200">Shared audio clock</Badge>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="studio-card border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <AudioLines className="h-4 w-4 text-amber-300" /> Dual audio deck
              </CardTitle>
              <p className="text-xs text-zinc-500">Both slots start from the same AudioContext clock.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <AudioSlotCard
                label="Slot 1 · Instrumental backing"
                slot={instrumental}
                loading={loadingSlot === "instrumental"}
                onFile={(file) => void loadSlot("instrumental", file)}
              />
              <AudioSlotCard
                label="Slot 2 · Guide vocal reference"
                slot={guideVocal}
                loading={loadingSlot === "guide"}
                onFile={(file) => void loadSlot("guide", file)}
              />

              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">Slot 2 alignment</p>
                    <p className="mt-1 text-xs text-zinc-500">Shift the guide vocal against the instrumental while auditioning.</p>
                  </div>
                  <output className="font-mono text-lg font-black tracking-tight text-amber-200" aria-live="polite">
                    OFFSET: {formatSignedOffset(guideOffset)}
                  </output>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal} onClick={() => nudgeGuide(-5)} className="min-w-14 font-mono text-xs">−5s</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal} onClick={() => nudgeGuide(-1)} className="min-w-14 font-mono text-xs">−1s</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal} onClick={() => nudgeGuide(-0.05)} className="min-w-16 font-mono text-xs">−50ms</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal || guideOffset === 0} onClick={resetGuideOffset} className="min-w-20 border-amber-300/35 text-amber-200 font-mono text-xs">0.000s Reset</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal} onClick={() => nudgeGuide(0.05)} className="min-w-16 font-mono text-xs">+50ms</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal} onClick={() => nudgeGuide(1)} className="min-w-14 font-mono text-xs">+1s</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!guideVocal} onClick={() => nudgeGuide(5)} className="min-w-14 font-mono text-xs">+5s</Button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-600">
                  <span>−15.000s</span>
                  <span>wide range</span>
                  <span>+15.000s</span>
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 sm:grid-cols-2">
                <DeckChannelControls
                  label="Slot 1 · Instrumental"
                  level={mixer.instrumentalLevel}
                  muted={mixer.instrumentalMute}
                  solo={mixer.instrumentalSolo}
                  onLevel={(value) => updateMixer({ instrumentalLevel: value })}
                  onMute={() => updateMixer({ instrumentalMute: !mixer.instrumentalMute })}
                  onSolo={() => updateMixer({ instrumentalSolo: !mixer.instrumentalSolo })}
                />
                <DeckChannelControls
                  label="Slot 2 · Guide vocal"
                  level={mixer.guideLevel}
                  muted={mixer.guideMute}
                  solo={mixer.guideSolo}
                  disabled={!guideVocal}
                  onLevel={(value) => updateMixer({ guideLevel: value })}
                  onMute={() => updateMixer({ guideMute: !mixer.guideMute })}
                  onSolo={() => updateMixer({ guideSolo: !mixer.guideSolo })}
                />
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-emerald-200/70 sm:col-span-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Master soft limiter protected before browser output
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2 font-mono text-zinc-400">
                    <span className={`studio-led ${isPlaying ? "" : "studio-led-dim"}`} />
                    {formatTime(playbackPosition)}
                  </span>
                  <div className="studio-vu" aria-label="Playback level">
                    {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
                  </div>
                  <span className="font-mono text-zinc-600">{formatTime(duration)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-900">
                  <div className="h-full rounded-full bg-amber-300 transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!isPlaying ? (
                    <Button type="button" onClick={() => void play()} disabled={!instrumental || loadingSlot !== null} className="gap-2 bg-amber-400 text-zinc-950 hover:bg-amber-300">
                      <Play className="h-4 w-4" /> Play both
                    </Button>
                  ) : (
                    <Button type="button" onClick={pause} className="gap-2 bg-amber-400 text-zinc-950 hover:bg-amber-300">
                      <Pause className="h-4 w-4" /> Pause both
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={resetPlayback} disabled={!instrumental} className="gap-2">
                    <RotateCcw className="h-4 w-4" /> Reset
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="studio-card border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <FileAudio className="h-4 w-4 text-amber-300" /> Line-break lyric parser
              </CardTitle>
              <p className="text-xs text-zinc-500">One Enter-created line equals one sequential timing block. Blank lines remain blocks.</p>
            </CardHeader>
            <CardContent>
              <textarea
                value={lyrics}
                onChange={(event) => updateLyrics(event.target.value)}
                placeholder={"Type or paste lyrics here…\nEvery newline becomes a line."}
                aria-label="Workshop lyrics"
                className="min-h-56 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-base leading-7 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-amber-300/40"
              />
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                <span>{lines.length} {lines.length === 1 ? "block" : "blocks"}</span>
                <span>Strict newline mode</span>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/75">LRCLIB synced lyrics</p>
                    <p className="mt-1 text-xs text-zinc-500">{timingSourceLabel}</p>
                  </div>
                  {syncedLyrics.length > 0 && (
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-200">
                      {syncedLyrics.length} timestamps
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={lrcQuery}
                    onChange={(event) => setLrcQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void searchLrclib(); }}
                    placeholder="Artist · Song name"
                    aria-label="Search LRCLIB"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-amber-300/40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void searchLrclib()}
                    disabled={lrcSearching || !lrcQuery.trim()}
                    className="gap-1.5 bg-amber-400 text-zinc-950 hover:bg-amber-300"
                  >
                    {lrcSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Search
                  </Button>
                </div>
                {lrcResults !== null && (
                  <div className="mt-3 space-y-1">
                    {lrcResults.length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        No LRCLIB match. Enter lyrics above, then use the manual line-break timer with the spacebar.
                      </p>
                    ) : (
                      lrcResults.map((track) => (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => selectLrclibTrack(track)}
                          className="w-full rounded-lg border border-white/5 px-3 py-2 text-left transition-colors hover:border-amber-300/30 hover:bg-white/5"
                        >
                          <span className="block truncate text-sm font-medium text-zinc-100">{track.trackName}</span>
                          <span className="block truncate text-xs text-zinc-500">
                            {track.artistName}{track.albumName ? ` · ${track.albumName}` : ""}
                            {track.syncedLyrics
                              ? <span className="ml-1 text-amber-300">· synced</span>
                              : <span className="ml-1 text-zinc-600">· manual</span>}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="studio-card border-amber-300/20 bg-black/20">
          <CardContent className="p-5 sm:p-7">
            <LyricTimer
              lines={lines}
              timings={timings}
                syncedLyrics={syncedLyrics}
              nextLineIndex={nextLineIndex}
              audioContext={audioContextRef.current}
              isPlaying={isPlaying}
                currentTimeSeconds={playbackPosition}
              onCapture={captureTiming}
              onReset={resetTimings}
            />
          </CardContent>
        </Card>

        <Card className="studio-card border-white/10 bg-black/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <Library className="mt-0.5 h-4 w-4 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-zinc-200">Stage Vault package</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {(syncedLyrics.length || timings.length)} timestamped {(syncedLyrics.length || timings.length) === 1 ? "line" : "lines"} · decoded instrumental buffer
                  {guideVocal ? " · guide vocal buffer" : ""}
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => void saveCatalog()} disabled={!instrumental || saving} className="gap-2 bg-amber-400 text-zinc-950 hover:bg-amber-300">
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : saved ? "Saved to Vault" : "Save to Vault"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void takeToMainStage()} disabled={!instrumental || saving} className="gap-2 border-amber-300/40 text-amber-200 hover:bg-amber-300/10">
              <Rocket className="h-4 w-4" /> 🚀 Take to Main Stage
            </Button>
          </CardContent>
        </Card>

        {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">{error}</p>}
      </main>
  );
}

function AudioSlotCard({
  label,
  slot,
  loading,
  onFile,
}: {
  label: string;
  slot: AudioSlot | null;
  loading: boolean;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label className="block cursor-pointer rounded-xl border border-white/10 bg-black/25 p-4 transition-colors hover:border-amber-300/30">
      <input
        type="file"
        accept="audio/*,.m4a,.wav,.mp3,.webm,.ogg,.flac,.aiff"
        className="sr-only"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
          <span className={`studio-led ${slot ? "" : "studio-led-dim"}`} />
          {label}
        </span>
        <Upload className="h-4 w-4 text-amber-300" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-zinc-200">
          {loading ? "Decoding audio…" : slot?.file.name ?? "Choose an audio file"}
        </p>
        {slot && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{formatTime(slot.duration)}</span>}
      </div>
    </label>
  );
}

function DeckChannelControls({
  label,
  level,
  muted,
  solo,
  disabled = false,
  onLevel,
  onMute,
  onSolo,
}: {
  label: string;
  level: number;
  muted: boolean;
  solo: boolean;
  disabled?: boolean;
  onLevel: (value: number) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  return (
    <div className={`rounded-lg border border-white/10 p-3 ${disabled ? "opacity-45" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">{label}</span>
        <span className="shrink-0 font-mono text-[10px] text-amber-200">{level}% · {formatDb(level)}</span>
      </div>
      <Slider
        value={[level]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={(values) => onLevel(values[0] ?? level)}
        aria-label={`${label} fader`}
        className="mt-3"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onMute} className={`h-7 gap-1 px-2 text-[10px] ${muted ? "border-rose-300/40 text-rose-200" : ""}`}>
          {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />} Mute
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onSolo} className={`h-7 px-2 text-[10px] ${solo ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : ""}`}>
          S Solo
        </Button>
      </div>
    </div>
  );
}