import { useRef, useState } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface Track { label: string; sub: string; src: string }

interface BeforeAfterDemoProps {
  before: Track;
  after: Track;
  heading?: string;
  sub?: string;
}

function DemoCard({
  track, playing, onToggle, accent,
}: {
  track: Track; playing: boolean; onToggle: () => void; accent: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
      accent
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border/40 bg-card/30"
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">{track.label}</p>
          <p className="text-[10px] text-muted-foreground">{track.sub}</p>
        </div>
        <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
          accent
            ? "bg-amber-500 hover:bg-amber-600 text-black"
            : "border border-border/50 text-foreground hover:bg-secondary/60"
        }`}
      >
        {playing
          ? <><Pause className="w-3.5 h-3.5" />Pause</>
          : <><Play className="w-3.5 h-3.5 fill-current" />Play {track.label}</>}
      </button>
    </div>
  );
}

export function BeforeAfterDemo({
  before, after, heading = "Hear the difference", sub = "Same clip — before and after processing.",
}: BeforeAfterDemoProps) {
  const beforeRef = useRef<HTMLAudioElement>(null);
  const afterRef  = useRef<HTMLAudioElement>(null);
  const [playingBefore, setPlayingBefore] = useState(false);
  const [playingAfter,  setPlayingAfter]  = useState(false);

  const toggle = async (side: "before" | "after") => {
    const mine  = side === "before" ? beforeRef.current : afterRef.current;
    const other = side === "before" ? afterRef.current  : beforeRef.current;
    if (!mine) return;
    if (!mine.paused) {
      mine.pause();
    } else {
      other?.pause();
      await mine.play().catch(() => {});
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/30 bg-card/20 p-4">
      <div>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DemoCard track={before} playing={playingBefore} accent={false} onToggle={() => toggle("before")} />
        <DemoCard track={after}  playing={playingAfter}  accent={true}  onToggle={() => toggle("after")}  />
      </div>
      <audio ref={beforeRef} src={before.src} preload="none"
        onPlay={() => setPlayingBefore(true)}
        onPause={() => setPlayingBefore(false)}
        onEnded={() => setPlayingBefore(false)} />
      <audio ref={afterRef}  src={after.src}  preload="none"
        onPlay={() => setPlayingAfter(true)}
        onPause={() => setPlayingAfter(false)}
        onEnded={() => setPlayingAfter(false)} />
    </div>
  );
}
