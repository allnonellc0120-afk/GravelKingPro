import { useEffect, useMemo } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LyricTiming = {
  lineIndex: number;
  contextTime: number;
  timeSeconds: number;
};

export type SyncedLyric = {
  time: number;
  text: string;
};

export type LyricTimerProps = {
  lines: string[];
  timings: LyricTiming[];
  syncedLyrics?: SyncedLyric[];
  nextLineIndex: number;
  audioContext: AudioContext | null;
  isPlaying: boolean;
  currentTimeSeconds?: number;
  onCapture: (timing: LyricTiming) => void;
  onReset?: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("textarea, input, select, [contenteditable='true']"));
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

export function LyricTimer({
  lines,
  timings,
  syncedLyrics = [],
  nextLineIndex,
  audioContext,
  isPlaying,
  currentTimeSeconds = 0,
  onCapture,
  onReset,
}: LyricTimerProps) {
  const hasSyncedLyrics = syncedLyrics.length > 0;
  const timingByLine = useMemo(
    () => new Map(timings.map((timing) => [timing.lineIndex, timing])),
    [timings],
  );
  const activeSyncedIndex = hasSyncedLyrics
    ? syncedLyrics.reduce((active, lyric, index) => (
      lyric.time <= currentTimeSeconds ? index : active
    ), -1)
    : -1;
  const visibleStart = Math.max(0, Math.min(
    Math.max(0, lines.length - 4),
    hasSyncedLyrics ? Math.max(0, activeSyncedIndex - 1) : nextLineIndex - 1,
  ));
  const visibleLines = lines.slice(visibleStart, visibleStart + 4);
  const isComplete = lines.length > 0 && nextLineIndex >= lines.length;
  const canCapture = Boolean(audioContext && isPlaying && !isComplete);

  const capture = () => {
    if (!audioContext || !isPlaying || isComplete) return;
    const contextTime = audioContext.currentTime;
    onCapture({
      lineIndex: nextLineIndex,
      contextTime,
      timeSeconds: contextTime,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isEditableTarget(event.target)) return;
      if (!canCapture) return;
      event.preventDefault();
      capture();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className="workshop-prompter" aria-label="Rolling lyric prompter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300/70">Rolling prompter</p>
          <p className="mt-1 text-xs text-zinc-500">
            {hasSyncedLyrics
              ? `LRCLIB synced timing · ${syncedLyrics.length} lines`
              : isComplete
                ? "All lines timed"
                : `${Math.min(nextLineIndex + 1, lines.length)} of ${lines.length} lines ready`}
          </p>
        </div>
        <div className="flex items-center gap-2">
        {onReset && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReset}
            disabled={timings.length === 0 && !hasSyncedLyrics}
            className="gap-2"
            aria-label="Reset timing"
          >
            Reset timing
          </Button>
        )}
        {!hasSyncedLyrics && (
          <Button
            type="button"
            size="sm"
            onClick={capture}
            disabled={!canCapture}
            className="gap-2 bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            <Clock3 className="h-4 w-4" />
            TIME LINE
            <kbd className="hidden rounded border border-zinc-950/25 px-1.5 py-0.5 text-[9px] font-bold sm:inline">SPACE</kbd>
          </Button>
        )}
        </div>
      </div>

      <div className="mt-5 min-h-[18rem] overflow-hidden rounded-xl border border-white/10 bg-black/25 px-4 py-5 sm:px-8">
        {visibleLines.length > 0 ? (
          <div className="space-y-3" aria-live="polite">
            {visibleLines.map((line, visibleIndex) => {
              const lineIndex = visibleStart + visibleIndex;
              const timing = timingByLine.get(lineIndex);
              const syncedLine = syncedLyrics[lineIndex];
              const active = hasSyncedLyrics
                ? lineIndex === activeSyncedIndex
                : lineIndex === nextLineIndex && !isComplete;
              return (
                <div
                  key={`${lineIndex}-${line}`}
                  className={`flex min-h-12 items-center justify-between gap-4 rounded-lg px-3 py-2 transition-colors ${
                    active ? "bg-amber-300/10 text-amber-100 ring-1 ring-amber-300/30" : "text-zinc-500"
                  }`}
                >
                  <p className={`min-w-0 whitespace-pre-wrap text-lg font-semibold leading-tight sm:text-2xl ${line ? "" : "text-zinc-700"}`}>
                    {line || " "}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                    {syncedLine
                      ? formatTime(syncedLine.time)
                      : timing
                        ? formatTime(timing.timeSeconds)
                        : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[15rem] items-center justify-center text-center text-sm text-zinc-600">
            Enter lyrics above to build the rolling line stack.
          </div>
        )}
      </div>
    </section>
  );
}

export default LyricTimer;