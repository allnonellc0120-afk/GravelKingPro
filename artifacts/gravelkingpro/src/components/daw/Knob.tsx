import { useCallback, useRef } from "react";

interface KnobProps {
  value: number;
  min: number;
  max: number;
  /** Detent step — drag snaps to multiples of this. */
  step?: number;
  /** Optional center value the knob softly snaps to (e.g. 0 dB / center pan). */
  detentCenter?: number;
  size?: number;
  color?: string;
  label?: string;
  display?: string;
  onChange: (v: number) => void;
}

/**
 * Detented rotary knob. Drag vertically (or use the wheel) to adjust; values
 * snap to `step` detents, with an extra soft snap toward `detentCenter`.
 */
export function Knob({
  value, min, max, step = 1, detentCenter,
  size = 40, color = "#f59e0b", label, display, onChange,
}: KnobProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const range = max - min;
  const frac = range > 0 ? (value - min) / range : 0;
  // Sweep from -135° to +135° (270° total).
  const angle = -135 + frac * 270;

  const snap = useCallback((raw: number) => {
    let v = Math.round(raw / step) * step;
    if (detentCenter !== undefined && Math.abs(v - detentCenter) < step * 1.2) {
      v = detentCenter;
    }
    return Math.max(min, Math.min(max, v));
  }, [step, detentCenter, min, max]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
  }, [value]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    // Fine control with Shift held.
    const sensitivity = (e.shiftKey ? 0.25 : 1) * range / 150;
    const raw = dragRef.current.startVal + dy * sensitivity;
    onChange(snap(raw));
  }, [range, onChange, snap]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(snap(value + dir * step));
  }, [value, step, onChange, snap]);

  const onDoubleClick = useCallback(() => {
    if (detentCenter !== undefined) onChange(detentCenter);
  }, [detentCenter, onChange]);

  const r = size / 2;

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="cursor-ns-resize touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <circle cx={r} cy={r} r={r - 3} fill="#0b0f17" stroke={`${color}40`} strokeWidth={1.5} />
        {/* Detent ticks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = (-135 + (i / 10) * 270) * (Math.PI / 180);
          const x1 = r + Math.cos(a) * (r - 5);
          const y1 = r + Math.sin(a) * (r - 5);
          const x2 = r + Math.cos(a) * (r - 2.5);
          const y2 = r + Math.sin(a) * (r - 2.5);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`${color}33`} strokeWidth={1} />;
        })}
        {/* Pointer */}
        <line
          x1={r}
          y1={r}
          x2={r + Math.cos(angle * (Math.PI / 180)) * (r - 8)}
          y2={r + Math.sin(angle * (Math.PI / 180)) * (r - 8)}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={r} cy={r} r={2.5} fill={color} />
      </svg>
      {(display || label) && (
        <div className="text-center leading-tight">
          {display && <div className="text-[9px] font-mono" style={{ color }}>{display}</div>}
          {label && <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>}
        </div>
      )}
    </div>
  );
}
