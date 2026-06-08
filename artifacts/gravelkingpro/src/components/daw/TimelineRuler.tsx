interface TimelineRulerProps {
  duration: number;
  position: number;
}

export function TimelineRuler({ duration, position }: TimelineRulerProps) {
  if (duration <= 0) {
    return <div className="h-6 bg-black/40 border-b border-border/20 shrink-0" />;
  }

  const step = duration <= 15 ? 1 : duration <= 60 ? 5 : duration <= 300 ? 15 : 30;
  const markers: number[] = [];
  for (let t = 0; t <= duration; t += step) markers.push(t);

  const fmt = (t: number) =>
    t < 60 ? `${t}s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

  return (
    <div className="relative h-6 bg-black/40 border-b border-border/20 shrink-0 overflow-hidden select-none">
      {markers.map(t => (
        <div
          key={t}
          className="absolute top-0 flex flex-col items-start"
          style={{ left: `${(t / duration) * 100}%` }}
        >
          <div className="w-px h-2.5 bg-white/25" />
          <span className="text-[9px] text-white/40 font-mono leading-none pl-0.5">{fmt(t)}</span>
        </div>
      ))}
      {/* Playhead marker */}
      <div
        className="absolute top-0 w-px h-full bg-amber-400/70 pointer-events-none"
        style={{ left: `${(position / duration) * 100}%` }}
      />
    </div>
  );
}
