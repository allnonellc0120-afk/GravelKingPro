import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import {
  ChevronLeft,
  Maximize2,
  Mic2,
  Pause,
  Play,
  Radio,
  Square,
  UserRound,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RollingPrompter } from "@/components/prompter/RollingPrompter";

export type StageLyric = {
  id?: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
};

export type StagePerformer = {
  id: string;
  label: string;
  name: string;
  avatarUrl?: string | null;
  accent: "gold" | "violet";
  analyser?: AnalyserNode | null;
  status?: string;
  onInvite?: () => void;
};

interface LivePerformanceStageProps {
  title: string;
  subtitle?: string;
  trackName?: string;
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  lyrics?: StageLyric[];
  performers: StagePerformer[];
  backingAnalyser?: AnalyserNode | null;
  onExit: () => void;
  onTogglePlayback?: () => void;
  onStop?: () => void;
  onSeek?: (fraction: number) => void;
  onRecord?: () => void;
  isRecording?: boolean;
  recordDisabled?: boolean;
  controlSlot?: ReactNode;
  headerSlot?: ReactNode;
  /** Rendered inside the jumbotron when no lyrics/track are loaded (primary CTA card). */
  emptySlot?: ReactNode;
  stageMode?: "solo" | "duet";
  audioContextTimeSec?: number;
  playbackStartContextTimeSec?: number | null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function sampleAnalyser(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteFrequencyData(buffer);
  if (buffer.length === 0) return 0;

  // Ignore the very lowest bins: mic rumble should not make the riser look live.
  const start = Math.floor(buffer.length * 0.04);
  const end = Math.max(start + 1, Math.floor(buffer.length * 0.72));
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += buffer[i] ?? 0;
  return Math.min(1, (sum / (end - start)) / 255 * 1.85);
}

export function LivePerformanceStage({
  title,
  subtitle = "Live performance mode",
  trackName,
  isPlaying,
  currentTimeSec,
  durationSec,
  lyrics = [],
  performers,
  backingAnalyser = null,
  onExit,
  onTogglePlayback,
  onStop,
  onSeek,
  onRecord,
  isRecording = false,
  recordDisabled = false,
  controlSlot,
  emptySlot,
  headerSlot,
  stageMode = "duet",
  audioContextTimeSec,
  playbackStartContextTimeSec,
}: LivePerformanceStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const performerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const performersRef = useRef(performers);
  performersRef.current = performers;

  const analyserKey = performers.map((performer) => `${performer.id}:${performer.analyser ? "live" : "idle"}`).join("|");
  const timelineEndMs = useMemo(() => {
    const lyricEnd = lyrics.reduce((max, lyric) => Math.max(max, lyric.endTimeMs), 0);
    return Math.max(1, durationSec * 1000, lyricEnd);
  }, [durationSec, lyrics]);
  const currentTimeMs = Math.max(0, currentTimeSec * 1000);
  const activeIndex = lyrics.findIndex(
    (lyric) => currentTimeMs >= lyric.startTimeMs && currentTimeMs < lyric.endTimeMs,
  );
  const activeLyric = activeIndex >= 0 ? lyrics[activeIndex] : null;
  const cursorLeft = Math.max(0, Math.min(100, (currentTimeMs / timelineEndMs) * 100));
  const progress = durationSec > 0 ? Math.max(0, Math.min(1, currentTimeSec / durationSec)) : 0;

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;

    const buffers = new Map<string, Uint8Array<ArrayBuffer>>();
    let frame = 0;
    const tick = () => {
      let backingLevel = 0;
      for (const performer of performersRef.current) {
        const riser = performerRefs.current[performer.id];
        const analyser = performer.analyser;
        let level = 0;
        if (analyser) {
          const existing = buffers.get(performer.id);
          const data = existing && existing.length === analyser.frequencyBinCount
            ? existing
            : new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
          buffers.set(performer.id, data);
          level = sampleAnalyser(analyser, data);
        }
        if (riser) {
          riser.style.setProperty("--mic-level", level.toFixed(3));
          riser.style.setProperty("--mic-scale", (level * 0.16).toFixed(3));
          riser.style.setProperty("--mic-glow", (0.18 + level * 0.72).toFixed(3));
          riser.style.setProperty("--mic-blur", `${10 + Math.round(level * 22)}px`);
          riser.dataset.micLive = level > 0.025 ? "true" : "false";
        }
        backingLevel = Math.max(backingLevel, level);
      }

      if (backingAnalyser) {
        const existing = buffers.get("__backing__");
        const data = existing && existing.length === backingAnalyser.frequencyBinCount
          ? existing
          : new Uint8Array(backingAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        buffers.set("__backing__", data);
        backingLevel = Math.max(backingLevel, sampleAnalyser(backingAnalyser, data));
      }

      root.style.setProperty("--stage-audio-level", backingLevel.toFixed(3));
      root.style.setProperty("--stage-beat-scale", (backingLevel * 0.045).toFixed(3));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      buffers.clear();
    };
  }, [analyserKey, backingAnalyser, isPlaying]);

  const sharedVars = {
    "--stage-progress": `${progress * 100}%`,
  } as CSSProperties;

  return (
    <div
      ref={stageRef}
      className="live-performance-stage fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden"
      data-playing={isPlaying}
      data-stage-mode={stageMode}
      data-testid="live-performance-stage"
      style={sharedVars}
    >
      <div className="stage-ambient-glow stage-ambient-glow-left" />
      <div className="stage-ambient-glow stage-ambient-glow-right" />

      <header className="stage-command-bar relative flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex h-11 min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70 transition-colors hover:border-amber-300/45 hover:bg-amber-300/10 hover:text-amber-200"
            title="Exit live performance stage"
            aria-label="Exit live performance stage"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Exit Stage</span>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="stage-eyebrow">{subtitle}</span>
            </div>
            <h1 className="truncate text-sm font-semibold text-white sm:text-base">{title}</h1>
          </div>
        </div>
        {headerSlot && (
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            {headerSlot}
          </div>
        )}
        <div className="hidden min-w-0 items-center gap-2 text-right sm:flex">
          <div className="min-w-0">
            <div className="stage-eyebrow">Now on stage</div>
            <div className="truncate text-xs text-white/80">{trackName || "Untitled performance"}</div>
          </div>
          <Maximize2 className="h-4 w-4 text-violet-300/70" />
        </div>
      </header>

      <main className="stage-viewport min-h-0 flex-1 overflow-hidden px-3 pb-2 pt-3 sm:px-8 sm:pt-5">
        <div className="stage-truss" aria-label="Arena lighting truss">
          <div className="stage-truss-beam stage-truss-beam-back" />
          <div className="stage-truss-beam stage-truss-beam-front" />
          <svg className="stage-spotlight-svg" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="stage-spot-gold" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#f8d477" stopOpacity="0.58" />
                <stop offset="1" stopColor="#f8b84e" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="stage-spot-violet" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#b89bff" stopOpacity="0.48" />
                <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon className="stage-spotlight stage-spotlight-left" points="115,28 190,28 410,390 235,390" fill="url(#stage-spot-gold)" />
            <polygon className="stage-spotlight stage-spotlight-center" points="468,26 532,26 630,390 370,390" fill="url(#stage-spot-violet)" />
            <polygon className="stage-spotlight stage-spotlight-right" points="810,28 885,28 765,390 590,390" fill="url(#stage-spot-gold)" />
          </svg>
        </div>

        <section className="stage-jumbotron" aria-label="Live lyric display">
          <div className="stage-jumbotron-bezel">
            <div className="stage-jumbotron-mesh" />
            <div className="stage-jumbotron-content">
              <span className="stage-jumbotron-label">
                {isPlaying ? "Live teleprompter" : "Stand by"}
              </span>
              {lyrics.length > 0 ? (
                <RollingPrompter
                  lines={lyrics}
                  currentTimeSec={currentTimeSec}
                  isPlaying={isPlaying}
                  audioContextTimeSec={audioContextTimeSec}
                  playbackStartContextTimeSec={playbackStartContextTimeSec}
                  className="stage-lyric-stack"
                />
              ) : emptySlot ? (
                emptySlot
              ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                  {trackName ? (
                    <>
                      <p className="stage-lyric-line stage-lyric-line-active truncate">{trackName}</p>
                      <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-sky-200">
                        🎵 Audio Only Mode — Free Performance
                      </span>
                    </>
                  ) : (
                    <p className="stage-lyric-line stage-lyric-line-active">Instrumental passage</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="stage-cadence-ribbon" aria-label="Lyric cadence timeline">
            <span className="stage-strike-cursor" style={{ left: `${cursorLeft}%` }} />
            {lyrics.map((lyric, index) => {
              const left = `${(lyric.startTimeMs / timelineEndMs) * 100}%`;
              const width = `${((lyric.endTimeMs - lyric.startTimeMs) / timelineEndMs) * 100}%`;
              return (
                <span
                  key={lyric.id ?? `${lyric.startTimeMs}-${index}`}
                  className={`stage-cadence-block ${index === activeIndex ? "stage-cadence-block-active" : ""}`}
                  style={{ left, width }}
                  title={`${formatTime(lyric.startTimeMs / 1000)} · ${lyric.text}`}
                />
              );
            })}
          </div>
        </section>

        <section className="stage-deck-wrap" aria-label="Concert stage floor">
          <div className="stage-deck">
            <div className="stage-deck-grid" aria-hidden="true">
              {Array.from({ length: 48 }, (_, index) => <span key={index} className="stage-deck-tile" />)}
            </div>
            <div className="stage-performer-row">
              {performers.map((performer) => (
                <div
                  key={performer.id}
                  ref={(node) => { performerRefs.current[performer.id] = node; }}
                  className={`stage-performer-riser stage-performer-riser-${performer.accent}`}
                  data-mic-live="false"
                  data-testid={`stage-performer-${performer.id}`}
                >
                  <div className="stage-riser-light" />
                  {performer.onInvite ? (
                    <button
                      type="button"
                      onClick={performer.onInvite}
                      className="stage-invite-partner-button"
                      aria-label="Invite duet partner"
                    >
                      <span className="stage-invite-plus">+</span>
                      <span>Invite Duet Partner</span>
                    </button>
                  ) : (
                    <>
                      <div className="stage-performer-avatar">
                        {performer.avatarUrl ? (
                          <img src={performer.avatarUrl} alt="" />
                        ) : (
                          <UserRound className="h-8 w-8" />
                        )}
                      </div>
                      <div className="stage-performer-name">{performer.name}</div>
                      <div className="stage-performer-status">
                        <Mic2 className="h-3 w-3" />
                        {performer.status || performer.label}
                      </div>
                    </>
                  )}
                  <div className="stage-riser-top" />
                  <div className="stage-riser-front" />
                </div>
              ))}
            </div>
            <div className="stage-floor-front-led" />
          </div>
        </section>
      </main>

      <footer className="stage-control-rail pb-safe shrink-0 px-3 pt-2 sm:px-6">
        <div className="stage-control-inner flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="stage-control-timeline min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[10px] text-white/55">
              <span className="font-mono">{formatTime(currentTimeSec)}</span>
              <span className="hidden truncate sm:block">{trackName || "No backing track"}</span>
              <span className="font-mono">{formatTime(durationSec)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={(event) => onSeek?.(Number(event.target.value))}
              disabled={!onSeek || durationSec <= 0}
              className="stage-progress-slider w-full"
              aria-label="Playback position"
            />
          </div>
          <div className="stage-control-actions flex min-w-0 flex-wrap items-center justify-between gap-1.5 sm:justify-end">
            {onTogglePlayback && (
              <Button
                size="sm"
                onClick={onTogglePlayback}
                className="studio-button-primary h-11 min-h-11 w-11 min-w-11 rounded-full bg-amber-400 p-0 text-black hover:bg-amber-300"
                aria-label={isPlaying ? "Pause playback" : "Play playback"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </Button>
            )}
            {onStop && (
              <button type="button" className="stage-transport-button min-h-11 min-w-11" onClick={onStop} title="Stop playback" aria-label="Stop playback">
                <Square className="h-3.5 w-3.5" />
              </button>
            )}
            {controlSlot}
            {onRecord && (
              <button
                type="button"
                onClick={onRecord}
                disabled={recordDisabled}
                className={`stage-record-button min-h-11 min-w-11 ${isRecording ? "stage-record-button-active" : ""}`}
                title={isRecording ? "Stop recording" : "Start recording"}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
              >
                {isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic2 className="h-4 w-4" />}
              </button>
            )}
            <span className="hidden items-center gap-1 text-[10px] uppercase tracking-widest text-white/45 md:flex">
              <Volume2 className="h-3 w-3" /> Live
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}