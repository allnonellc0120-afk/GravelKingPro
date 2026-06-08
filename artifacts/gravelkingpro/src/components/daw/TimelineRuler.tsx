interface TimelineRulerProps {
  duration: number;
  position: number;
  bpm?: number;
}

export function TimelineRuler({ duration, position, bpm }: TimelineRulerProps) {
  if (duration <= 0) {
    return <div className="h-6 bg-black/40 border-b border-border/20 shrink-0" />;
  }

  const playheadPct = (position / duration) * 100;

  // BPM mode — show bars and beat subdivisions
  if (bpm && bpm > 0) {
    const beatDur = 60 / bpm;
    const barDur  = beatDur * 4;
    const totalBars = Math.ceil(duration / barDur);
    // Only render beat sub-markers when there aren't too many bars (avoids crowding)
    const showBeats = totalBars < 48;

    type Marker = { pos: number; label: string; isBar: boolean };
    const markers: Marker[] = [];

    for (let bar = 0; bar * barDur <= duration; bar++) {
      const t = bar * barDur;
      markers.push({ pos: (t / duration) * 100, label: String(bar + 1), isBar: true });
      if (showBeats) {
        for (let beat = 1; beat < 4; beat++) {
          const bt = t + beat * beatDur;
          if (bt < duration) {
            markers.push({ pos: (bt / duration) * 100, label: "", isBar: false });
          }
        }
      }
    }

    return (
      <div className="relative h-6 bg-black/40 border-b border-border/20 shrink-0 overflow-hidden select-none">
        {markers.map(({ pos, label, isBar }, i) => (
          <div key={i} className="absolute top-0 flex flex-col items-start" style={{ left: `${pos}%` }}>
            <div className={`w-px ${isBar ? "h-3 bg-white/30" : "h-1.5 bg-white/12"}`} />
            {label && <span className="text-[9px] text-white/40 font-mono leading-none pl-0.5">{label}</span>}
          </div>
        ))}
        <div className="absolute top-0 w-px h-full bg-amber-400/70 pointer-events-none" style={{ left: `${playheadPct}%` }} />
      </div>
    );
  }

  // Fallback — seconds-based display
  const step = duration <= 15 ? 1 : duration <= 60 ? 5 : duration <= 300 ? 15 : 30;
  const markers: number[] = [];
  for (let t = 0; t <= duration; t += step) markers.push(t);
  const fmt = (t: number) =>
    t < 60 ? `${t}s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

  return (
    <div className="relative h-6 bg-black/40 border-b border-border/20 shrink-0 overflow-hidden select-none">
      {markers.map(t => (
        <div key={t} className="absolute top-0 flex flex-col items-start" style={{ left: `${(t / duration) * 100}%` }}>
          <div className="w-px h-2.5 bg-white/25" />
          <span className="text-[9px] text-white/40 font-mono leading-none pl-0.5">{fmt(t)}</span>
        </div>
      ))}
      <div className="absolute top-0 w-px h-full bg-amber-400/70 pointer-events-none" style={{ left: `${playheadPct}%` }} />
    </div>
  );
}
