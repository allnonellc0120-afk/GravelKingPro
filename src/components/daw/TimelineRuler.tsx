interface TimelineRulerProps {
  duration: number;
  position: number;
  bpm?: number;
  zoom?: number;
  scrollOffset?: number;
}

export function TimelineRuler({ duration, position, bpm, zoom = 1, scrollOffset = 0 }: TimelineRulerProps) {
  if (duration <= 0) {
    return <div className="flex-1 h-6 bg-black/40 border-b border-border/20 shrink-0" />;
  }

  const viewFrac  = 1 / Math.max(1, zoom);
  const maxStart  = 1 - viewFrac;
  const startFrac = Math.max(0, Math.min(maxStart, scrollOffset));
  const endFrac   = startFrac + viewFrac;
  const startTime = startFrac * duration;
  const endTime   = endFrac   * duration;

  const mapPct = (t: number) =>
    ((t / duration - startFrac) / (endFrac - startFrac)) * 100;

  const playheadPct = mapPct(position);

  // BPM mode — show bars and beat subdivisions
  if (bpm && bpm > 0) {
    const beatDur   = 60 / bpm;
    const barDur    = beatDur * 4;
    const visibleBars = Math.ceil((endTime - startTime) / barDur);
    const showBeats = visibleBars < 48;

    type Marker = { pct: number; label: string; isBar: boolean };
    const markers: Marker[] = [];

    const firstBar = Math.floor(startTime / barDur);
    const lastBar  = Math.ceil(endTime   / barDur);

    for (let bar = firstBar; bar <= lastBar; bar++) {
      const t = bar * barDur;
      if (t > endTime + 0.0001) break;
      if (t >= startTime - 0.0001) {
        markers.push({ pct: mapPct(t), label: String(bar + 1), isBar: true });
      }
      if (showBeats) {
        for (let beat = 1; beat < 4; beat++) {
          const bt = t + beat * beatDur;
          if (bt < startTime - 0.0001 || bt > endTime + 0.0001) continue;
          markers.push({ pct: mapPct(bt), label: "", isBar: false });
        }
      }
    }

    return (
      <div className="relative flex-1 h-6 bg-black/40 border-b border-border/20 overflow-hidden select-none">
        {markers.map(({ pct, label, isBar }, i) => (
          <div key={i} className="absolute top-0 flex flex-col items-start" style={{ left: `${pct}%` }}>
            <div className={`w-px ${isBar ? "h-3 bg-white/30" : "h-1.5 bg-white/12"}`} />
            {label && <span className="text-[9px] text-white/40 font-mono leading-none pl-0.5">{label}</span>}
          </div>
        ))}
        {playheadPct >= 0 && playheadPct <= 100 && (
          <div className="absolute top-0 w-px h-full bg-amber-400/70 pointer-events-none" style={{ left: `${playheadPct}%` }} />
        )}
      </div>
    );
  }

  // Fallback — seconds-based display
  const visibleDur = endTime - startTime;
  const step = visibleDur <= 15 ? 1 : visibleDur <= 60 ? 5 : visibleDur <= 300 ? 15 : 30;
  const firstT = Math.floor(startTime / step) * step;
  const markers: number[] = [];
  for (let t = firstT; t <= endTime + 0.0001; t += step) {
    if (t >= startTime - 0.0001) markers.push(t);
  }
  const fmt = (t: number) =>
    t < 60 ? `${t}s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

  return (
    <div className="relative flex-1 h-6 bg-black/40 border-b border-border/20 overflow-hidden select-none">
      {markers.map(t => (
        <div key={t} className="absolute top-0 flex flex-col items-start" style={{ left: `${mapPct(t)}%` }}>
          <div className="w-px h-2.5 bg-white/25" />
          <span className="text-[9px] text-white/40 font-mono leading-none pl-0.5">{fmt(t)}</span>
        </div>
      ))}
      {playheadPct >= 0 && playheadPct <= 100 && (
        <div className="absolute top-0 w-px h-full bg-amber-400/70 pointer-events-none" style={{ left: `${playheadPct}%` }} />
      )}
    </div>
  );
}
