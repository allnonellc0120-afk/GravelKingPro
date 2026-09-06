import { useState, useRef } from "react";
import { Play, Square, Pause, Volume2, Repeat, SkipBack, SkipForward } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00.0";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function formatBarsBeats(secs: number, bpm: number): string {
  if (!isFinite(secs) || secs < 0 || bpm <= 0) return "1:1";
  const totalBeats = (secs * bpm) / 60;
  const bar  = Math.floor(totalBeats / 4) + 1;
  const beat = Math.floor(totalBeats % 4) + 1;
  return `${bar}:${beat}`;
}

interface TransportProps {
  isPlaying: boolean;
  position: number;
  duration: number;
  masterVolume: number;
  loop: boolean;
  bpm: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (v: number) => void;
  onLoopToggle: () => void;
  onBpmChange: (bpm: number) => void;
  trackCount: number;
  /** Jump back/forward in seconds (default 5s) */
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  /** Position the bar at the bottom instead of top */
  barPosition?: "top" | "bottom";
}

export function Transport({
  isPlaying, position: pos, duration, masterVolume, loop, bpm,
  onPlay, onPause, onStop, onSeek, onVolumeChange, onLoopToggle,
  onBpmChange, trackCount,
  onSkipBack, onSkipForward,
  barPosition = "top",
}: TransportProps) {
  const pct = duration > 0 ? pos / duration : 0;
  const [bpmDraft, setBpmDraft] = useState(String(bpm));
  const tapTimesRef = useRef<number[]>([]);

  const commitBpm = (raw: string) => {
    const v = parseInt(raw, 10);
    if (isFinite(v) && v >= 40 && v <= 240) {
      onBpmChange(v);
      setBpmDraft(String(v));
    } else {
      setBpmDraft(String(bpm));
    }
  };

  const handleTap = () => {
    const now = Date.now();
    const recent = tapTimesRef.current.filter(t => now - t < 2500);
    recent.push(now);
    tapTimesRef.current = recent;
    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((t, i) => t - recent[i]);
      const avg = intervals.reduce((a, b) => a + b) / intervals.length;
      const next = Math.max(40, Math.min(240, Math.round(60000 / avg)));
      onBpmChange(next);
      setBpmDraft(String(next));
    }
  };

  const barClasses = barPosition === "bottom"
    ? "fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-black/90 backdrop-blur-md px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-4 select-none pb-[env(safe-area-inset-bottom,0px)]"
    : "sticky top-0 z-30 border-b border-border/30 bg-black/90 backdrop-blur-md px-4 py-2.5 flex items-center gap-4 select-none";

  return (
    <div className={barClasses}>

      {/* Playback controls — centered, larger */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={onStop}
          className="h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors active:scale-95"
          title="Stop"
        >
          <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
        </button>

        <button
          onClick={onSkipBack}
          disabled={!onSkipBack}
          className="h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors active:scale-95 disabled:opacity-30"
          title="Back 5s"
        >
          <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
        </button>

        <button
          className={`h-12 w-12 sm:h-14 sm:w-14 flex items-center justify-center rounded-full transition-all active:scale-95 ${
            isPlaying
              ? "bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20"
              : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30"
          }`}
          onClick={isPlaying ? onPause : onPlay}
          disabled={trackCount === 0}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" /> : <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />}
        </button>

        <button
          onClick={onSkipForward}
          disabled={!onSkipForward}
          className="h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors active:scale-95 disabled:opacity-30"
          title="Forward 5s"
        >
          <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
        </button>

        <button
          onClick={onLoopToggle}
          className={`h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-lg transition-colors active:scale-95 ${
            loop ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground hover:text-white hover:bg-white/5"
          }`}
          title="Loop"
        >
          <Repeat className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Position / Scrubber */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="font-mono tabular-nums shrink-0 text-center w-16 sm:w-20">
            <div className="text-xs sm:text-sm leading-none text-white/90">{formatTime(pos)}</div>
            <div className="text-[9px] text-amber-400/55 mt-0.5">{formatBarsBeats(pos, bpm)}</div>
          </div>
          <div className="flex-1 min-w-0 relative h-2 sm:h-2.5 rounded-full bg-white/10 cursor-pointer group"
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pctNew = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(pctNew);
            }}
            onTouchStart={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const touch = e.touches[0];
              onSeek(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const touch = e.touches[0];
              onSeek(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));
            }}
          >
            <div className="absolute left-0 top-0 h-full rounded-full bg-amber-500 transition-none" style={{ width: `${pct * 100}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-400 shadow-md shadow-amber-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${pct * 100}% - 8px)` }}
            />
          </div>
          <span className="font-mono text-[10px] sm:text-xs text-muted-foreground shrink-0 w-10 sm:w-12 text-right">{formatTime(duration)}</span>
        </div>
      </div>

      {/* BPM + Volume */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* BPM */}
        <div className="hidden sm:flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-border/20 hover:border-amber-500/30 transition-colors group/bpm">
            <span className="text-[10px] text-muted-foreground">BPM</span>
            <input
              type="number"
              min={40}
              max={240}
              value={bpmDraft}
              onChange={e => setBpmDraft(e.target.value)}
              onBlur={e => commitBpm(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setBpmDraft(String(bpm)); e.currentTarget.blur(); }
              }}
              className="w-10 text-xs font-mono font-bold text-white bg-transparent border-none outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text"
              title="Edit BPM (40–240)"
            />
          </div>
          <button
            onClick={handleTap}
            className="text-[10px] px-2 py-1.5 rounded bg-white/5 border border-border/20 hover:border-amber-500/40 hover:text-amber-400 text-muted-foreground font-semibold tracking-wide transition-colors active:scale-95 active:bg-amber-500/10"
            title="Tap tempo"
          >
            TAP
          </button>
        </div>

        {/* Master Volume */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-20 sm:w-28">
          <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
          <Slider value={[masterVolume * 100]} onValueChange={([v]) => onVolumeChange(v / 100)} min={0} max={100} step={1} className="w-full" />
          <span className="hidden sm:block text-[10px] font-mono text-muted-foreground w-7 text-right">{Math.round(masterVolume * 100)}</span>
        </div>
      </div>
    </div>
  );
}
