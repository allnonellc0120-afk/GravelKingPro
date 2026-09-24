import { useEffect, useMemo, useRef } from "react";

export type RollingPrompterLine = {
  id?: string;
  text: string;
  startTimeMs: number;
  endTimeMs?: number;
};

type RollingPrompterProps = {
  lines: RollingPrompterLine[];
  currentTimeSec: number;
  isPlaying: boolean;
  audioContextTimeSec?: number;
  playbackStartContextTimeSec?: number | null;
  className?: string;
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export function getActivePrompterIndex(lines: RollingPrompterLine[], currentTimeSec: number): number {
  let index = -1;
  const timeMs = Math.max(0, currentTimeSec) * 1000;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.startTimeMs <= timeMs) index = i;
    else break;
  }
  return index;
}

export function prompterTimeFromAudioContext(audioContextTimeSec: number, playbackStartContextTimeSec: number): number {
  return Math.max(0, audioContextTimeSec - playbackStartContextTimeSec);
}

export function RollingPrompter({
  lines,
  currentTimeSec,
  isPlaying,
  audioContextTimeSec,
  playbackStartContextTimeSec,
  className = "",
}: RollingPrompterProps) {
  const clockTimeSec = audioContextTimeSec != null && playbackStartContextTimeSec != null
    ? prompterTimeFromAudioContext(audioContextTimeSec, playbackStartContextTimeSec)
    : currentTimeSec;
  const active = useMemo(() => getActivePrompterIndex(lines, clockTimeSec), [clockTimeSec, lines]);
  const center = active >= 0 ? active : 0;
  const visible = lines.slice(Math.max(0, Math.min(Math.max(0, lines.length - 3), center - 1)), Math.max(0, Math.min(Math.max(0, lines.length - 3), center - 1)) + 3);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Record<number, HTMLParagraphElement | null>>({});

  useEffect(() => {
    const node = active >= 0 ? lineRefs.current[active] : null;
    if (node && isPlaying) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, isPlaying]);

  return (
    <div ref={viewportRef} className={`rolling-prompter min-h-[7.5rem] overflow-hidden ${className}`} aria-label="Rolling three-line prompter">
      {lines.length ? (
        <div className="space-y-1.5">
          {visible.map((line, offset) => {
            const index = Math.max(0, Math.min(Math.max(0, lines.length - 3), center - 1)) + offset;
            const isActive = index === active;
            const isPast = active >= 0 && index < active;
            return (
              <p
                key={line.id ?? `${line.startTimeMs}-${index}`}
                ref={(node) => { lineRefs.current[index] = node; }}
                className={`flex min-h-8 items-center justify-between gap-3 rounded-lg px-3 py-1.5 transition-all duration-300 ${isActive ? "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30" : isPast ? "text-white/25" : "text-white/55"}`}
              >
                <span className={`min-w-0 text-lg font-semibold leading-tight sm:text-xl ${isActive ? "scale-[1.01]" : ""}`}>{line.text || " "}</span>
                <span className="shrink-0 font-mono text-[9px] text-white/30">{formatTime(line.startTimeMs / 1000)}</span>
              </p>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-[7.5rem] items-center justify-center text-sm text-white/35">Add synced lyrics to start the prompter.</div>
      )}
    </div>
  );
}

export default RollingPrompter;