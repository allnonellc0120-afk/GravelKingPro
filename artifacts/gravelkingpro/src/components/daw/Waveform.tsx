import { useRef, useEffect, useCallback } from "react";

interface Region {
  start: number;
  end: number;
}

/** Start/end edges of other clips, used for magnetic snap detection */
interface ClipEdge {
  start: number;
  end: number;
}

interface WaveformProps {
  peaks: number[];
  duration: number;
  position: number;
  region: Region | null;
  color: string;
  height?: number;
  zoom?: number;
  scrollOffset?: number;
  bpm?: number;
  /** Arrangement-mode props — when provided, canvas shows full timeline */
  startOffset?: number;
  totalDuration?: number;
  /**
   * Other clips' start/end edges for magnetic snap (arrangement mode only).
   * Snap activates when clip edge is within SNAP_PX pixels of an edge.
   * Hold Alt to disable snap.
   */
  snapEdges?: ClipEdge[];
  onSeek?: (seconds: number) => void;
  onRegionChange?: (region: Region | null) => void;
  /** Arrangement mode: drag clip to new startOffset */
  onMoveClip?: (newStartOffset: number) => void;
  /** Called when the user wheel-scrolls to pan the waveform view */
  onScrollChange?: (newOffset: number) => void;
}

/** Snap threshold in canvas CSS pixels */
const SNAP_PX = 8;

export function Waveform({
  peaks, duration, position, region, color,
  height = 64, zoom = 1, scrollOffset = 0, bpm,
  startOffset, totalDuration, snapEdges,
  onSeek, onRegionChange, onMoveClip, onScrollChange,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    startX: number;
    startTime: number;
    mode: "seek" | "region" | "clip";
    clipStartOffset: number;
  } | null>(null);
  const rafRef = useRef<number>(0);
  /** Time position (seconds) of the active snap highlight, or null */
  const snapLineRef = useRef<number | null>(null);

  const isArrangement = totalDuration !== undefined && totalDuration > 0 && startOffset !== undefined;
  const timeLen = isArrangement ? totalDuration! : duration;

  const propsRef = useRef({
    peaks, duration, position, region, color, height,
    zoom, scrollOffset, bpm, startOffset, totalDuration, isArrangement, timeLen,
    snapEdges,
  });
  propsRef.current = {
    peaks, duration, position, region, color, height,
    zoom, scrollOffset, bpm, startOffset, totalDuration, isArrangement, timeLen,
    snapEdges,
  };

  const getViewWindow = () => {
    const { zoom, scrollOffset, timeLen } = propsRef.current;
    const viewFrac = 1 / Math.max(1, zoom);
    const maxStart = 1 - viewFrac;
    const startFrac = Math.max(0, Math.min(maxStart, scrollOffset));
    return {
      startFrac,
      endFrac: startFrac + viewFrac,
      startTime: startFrac * timeLen,
      endTime: (startFrac + viewFrac) * timeLen,
    };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { peaks, duration, position, region, color, bpm, isArrangement, startOffset, totalDuration } = propsRef.current;
    const { startFrac, endFrac, startTime, endTime } = getViewWindow();
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    ctx.clearRect(0, 0, W, H);

    // ── Arrangement mode ──────────────────────────────────────────────────────
    if (isArrangement) {
      const tLen = totalDuration!;
      const off  = startOffset!;
      const mapX = (t: number) => ((t / tLen - startFrac) / (endFrac - startFrac)) * W;

      // Empty track background (entire row)
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);

      // Beat grid across full timeline
      if (bpm && bpm > 0) {
        const beatDur = 60 / bpm;
        const firstBeat = Math.floor(startTime / beatDur);
        const lastBeat  = Math.ceil(endTime  / beatDur);
        for (let b = firstBeat; b <= lastBeat; b++) {
          const t = b * beatDur;
          if (t < startTime - 0.0001 || t > endTime + 0.0001) continue;
          const x = mapX(t);
          const isBar = b % 4 === 0;
          ctx.strokeStyle = isBar ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.035)";
          ctx.lineWidth   = isBar ? 0.8 : 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
      }

      // Clip bounds in canvas pixels
      const cx1 = mapX(off);
      const cx2 = mapX(off + duration);
      const vcx1 = Math.max(0, cx1);
      const vcx2 = Math.min(W, cx2);

      if (vcx2 > vcx1) {
        // Clip background
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(vcx1, 0, vcx2 - vcx1, H);

        // Region highlight (clip-local → global)
        if (region) {
          const rrx1 = mapX(off + region.start);
          const rrx2 = mapX(off + region.end);
          const crx1 = Math.max(vcx1, rrx1);
          const crx2 = Math.min(vcx2, rrx2);
          if (crx2 > crx1) {
            ctx.fillStyle = "rgba(245,158,11,0.15)";
            ctx.fillRect(crx1, 0, crx2 - crx1, H);
            ctx.fillStyle = "rgba(245,158,11,0.5)";
            if (rrx1 >= vcx1 && rrx1 <= vcx2) ctx.fillRect(rrx1, 0, 1, H);
            if (rrx2 >= vcx1 && rrx2 <= vcx2) ctx.fillRect(rrx2, 0, 1, H);
          }
        }

        // Waveform bars
        if (peaks.length > 0) {
          const pixPerSec = W / ((endFrac - startFrac) * tLen);
          const barW = Math.max(1, pixPerSec * (duration / peaks.length) - 0.5);
          const mid = H / 2;
          const clipViewStart = Math.max(startTime, off);
          const clipViewEnd   = Math.min(endTime,   off + duration);
          if (clipViewEnd > clipViewStart) {
            const iStart = Math.floor(((clipViewStart - off) / duration) * peaks.length);
            const iEnd   = Math.ceil (((clipViewEnd   - off) / duration) * peaks.length);
            for (let i = Math.max(0, iStart); i < Math.min(iEnd, peaks.length); i++) {
              const globalT = off + ((i + 0.5) / peaks.length) * duration;
              const x = mapX(globalT);
              if (x < vcx1 - 2 || x > vcx2 + 2) continue;
              const h = Math.max(2, peaks[i] * H * 0.85);
              const alpha = position > 0 && globalT < position ? 1.0 : 0.55;
              ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
              ctx.fillRect(x - barW / 2, mid - h / 2, Math.max(1, barW), h);
            }
          }
        }

        // Clip border
        ctx.strokeStyle = `${color}50`;
        ctx.lineWidth = 1;
        ctx.strokeRect(vcx1 + 0.5, 0.5, vcx2 - vcx1 - 1, H - 1);
      }

      // ── Magnetic snap highlight line ────────────────────────────────────────
      const snapT = snapLineRef.current;
      if (snapT !== null) {
        const sx = mapX(snapT);
        if (sx >= -1 && sx <= W + 1) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.shadowColor = "rgba(255,255,255,0.4)";
          ctx.shadowBlur = 4;
          ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
          ctx.restore();
        }
      }

      // Playhead
      if (tLen > 0 && position >= startTime && position <= endTime) {
        const px = mapX(position);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.moveTo(px - 4, 0);
        ctx.lineTo(px + 4, 0);
        ctx.lineTo(px, 6);
        ctx.fill();
      }
      return;
    }

    // ── Clip-local mode (existing behaviour) ─────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);

    if (bpm && bpm > 0 && duration > 0) {
      const beatDur = 60 / bpm;
      const firstBeat = Math.floor(startTime / beatDur);
      const lastBeat  = Math.ceil(endTime   / beatDur);
      for (let b = firstBeat; b <= lastBeat; b++) {
        const t = b * beatDur;
        if (t < startTime - 0.0001 || t > endTime + 0.0001) continue;
        const x = ((t / duration - startFrac) / (endFrac - startFrac)) * W;
        const isBar = b % 4 === 0;
        ctx.strokeStyle = isBar ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
        ctx.lineWidth   = isBar ? 0.8 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    }

    if (region && duration > 0) {
      const mapX = (t: number) => ((t / duration - startFrac) / (endFrac - startFrac)) * W;
      const rx1 = mapX(region.start);
      const rx2 = mapX(region.end);
      if (rx2 > 0 && rx1 < W) {
        const cx1 = Math.max(0, rx1), cx2 = Math.min(W, rx2);
        ctx.fillStyle = "rgba(245,158,11,0.15)";
        ctx.fillRect(cx1, 0, cx2 - cx1, H);
        ctx.fillStyle = "rgba(245,158,11,0.5)";
        if (rx1 >= 0 && rx1 <= W) ctx.fillRect(rx1, 0, 1, H);
        if (rx2 >= 0 && rx2 <= W) ctx.fillRect(rx2, 0, 1, H);
      }
    }

    if (peaks.length > 0) {
      const iStart = Math.floor(startFrac * peaks.length);
      const iEnd   = Math.ceil(endFrac   * peaks.length);
      const visible = peaks.slice(iStart, iEnd);
      const barW = Math.max(1, W / visible.length);
      const mid  = H / 2;
      for (let i = 0; i < visible.length; i++) {
        const x = (i / visible.length) * W;
        const h = Math.max(2, visible[i] * H * 0.85);
        const tAtBar = startTime + ((i + 0.5) / visible.length) * (endTime - startTime);
        const alpha  = position > 0 && duration > 0 && tAtBar < position ? 1.0 : 0.55;
        ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 40; i++) {
        const x = (i / 40) * W;
        const h = 10 + Math.sin(i * 0.7) * 8;
        ctx.fillRect(x, H / 2 - h / 2, W / 40 - 1, h);
      }
    }

    if (duration > 0 && position >= startTime && position <= endTime) {
      const px = ((position / duration - startFrac) / (endFrac - startFrac)) * W;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(px - 4, 0);
      ctx.lineTo(px + 4, 0);
      ctx.lineTo(px, 6);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  });

  const getTime = (e: React.MouseEvent<HTMLCanvasElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const { startTime, endTime } = getViewWindow();
    return startTime + pct * (endTime - startTime);
  };

  const snapTime = (t: number, shiftHeld: boolean): number => {
    const { bpm } = propsRef.current;
    if (!shiftHeld || !bpm || bpm <= 0) return t;
    const beatDur = 60 / bpm;
    return Math.round(t / beatDur) * beatDur;
  };

  /**
   * Attempt to magnetically snap newOffset to another clip edge.
   * Returns [snappedOffset, snapEdgeTime | null].
   * altHeld disables snap.
   *
   * Four alignment cases, each with its own candidate-specific distance:
   *   1. my start → edge.start  (delta = |clipStart - edge.start|)
   *   2. my start → edge.end    (delta = |clipStart - edge.end|)
   *   3. my end   → edge.start  (delta = |clipEnd   - edge.start|)
   *   4. my end   → edge.end    (delta = |clipEnd   - edge.end|)
   */
  const magneticSnap = (
    newOffset: number,
    clipDuration: number,
    canvasWidth: number,
    altHeld: boolean,
  ): [number, number | null] => {
    const { snapEdges, isArrangement } = propsRef.current;
    if (!isArrangement || altHeld || !snapEdges || snapEdges.length === 0) {
      return [newOffset, null];
    }

    const { startFrac, endFrac } = getViewWindow();
    const viewDuration = (endFrac - startFrac) * propsRef.current.timeLen;
    const pxToTime = viewDuration / canvasWidth;
    const threshold = SNAP_PX * pxToTime;

    const clipStart = newOffset;
    const clipEnd   = newOffset + clipDuration;

    let bestDelta = threshold;
    let bestSnap: number | null = null;
    let bestEdge: number | null = null;

    for (const edge of snapEdges) {
      // Each tuple: [candidateOffset, snapHighlightTime, distance]
      const cases: [number, number, number][] = [
        [edge.start,                edge.start, Math.abs(clipStart - edge.start)],
        [edge.end,                  edge.end,   Math.abs(clipStart - edge.end)  ],
        [edge.start - clipDuration, edge.start, Math.abs(clipEnd   - edge.start)],
        [edge.end   - clipDuration, edge.end,   Math.abs(clipEnd   - edge.end)  ],
      ];
      for (const [candidateOffset, edgeTime, delta] of cases) {
        if (delta < bestDelta) {
          bestDelta = delta;
          bestSnap  = Math.max(0, candidateOffset);
          bestEdge  = edgeTime;
        }
      }
    }

    return bestSnap !== null ? [bestSnap, bestEdge] : [newOffset, null];
  };

  const isInsideClip = (globalT: number): boolean => {
    const { startOffset, duration, isArrangement } = propsRef.current;
    return !!(isArrangement && startOffset !== undefined && globalT >= startOffset && globalT <= startOffset + duration);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const t = getTime(e);
    if (isInsideClip(t) && onMoveClip) {
      dragRef.current = { startX: e.clientX, startTime: t, mode: "clip", clipStartOffset: propsRef.current.startOffset! };
    } else {
      const snapped = snapTime(t, e.shiftKey);
      dragRef.current = { startX: e.clientX, startTime: snapped, mode: "seek", clipStartOffset: 0 };
      if (onRegionChange) onRegionChange(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;

    if (dragRef.current.mode === "clip" && onMoveClip) {
      const canvas = canvasRef.current;
      const rect = e.currentTarget.getBoundingClientRect();
      const { startFrac, endFrac } = getViewWindow();
      const viewDuration = (endFrac - startFrac) * propsRef.current.timeLen;
      const dtPerPx = viewDuration / rect.width;
      const dx = e.clientX - dragRef.current.startX;
      let rawOffset = Math.max(0, dragRef.current.clipStartOffset + dx * dtPerPx);

      // Beat snap (Shift)
      if (e.shiftKey) rawOffset = snapTime(rawOffset, true);

      // Magnetic snap (unless Alt held)
      const canvasW = canvas ? canvas.getBoundingClientRect().width : rect.width;
      const [snappedOffset, snapEdgeTime] = magneticSnap(
        rawOffset,
        propsRef.current.duration,
        canvasW,
        e.altKey,
      );

      snapLineRef.current = snapEdgeTime;
      onMoveClip(snappedOffset);
      return;
    }

    if (dragRef.current.mode === "seek" || dragRef.current.mode === "region") {
      const dx = Math.abs(e.clientX - dragRef.current.startX);
      if (dx < 4) return;
      dragRef.current.mode = "region";
      const t2 = snapTime(getTime(e), e.shiftKey);
      const start = Math.min(dragRef.current.startTime, t2);
      const end   = Math.max(dragRef.current.startTime, t2);
      if (onRegionChange && !propsRef.current.isArrangement) {
        onRegionChange({ start, end });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    if (dx < 4 && onSeek) {
      onSeek(dragRef.current.startTime);
      if (onRegionChange && !propsRef.current.isArrangement) onRegionChange(null);
    }
    snapLineRef.current = null;
    dragRef.current = null;
  };

  const handleMouseLeave = () => {
    if (dragRef.current?.mode === "clip") {
      snapLineRef.current = null;
    }
    dragRef.current = null;
  };

  // Show grab cursor when hovering over the clip block in arrangement mode
  const handleMouseMoveForCursor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) {
      const t = getTime(e);
      e.currentTarget.style.cursor = isInsideClip(t) && onMoveClip ? "grab" : "crosshair";
    }
    handleMouseMove(e);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const { zoom, scrollOffset } = propsRef.current;
    if (zoom <= 1) return;
    e.preventDefault();
    const viewFrac = 1 / zoom;
    const delta = (e.deltaX !== 0 ? e.deltaX : e.deltaY) / 800;
    const maxStart = 1 - viewFrac;
    const newOffset = Math.max(0, Math.min(maxStart, scrollOffset + delta * viewFrac));
    onScrollChange?.(newOffset);
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded"
      style={{ height, display: "block" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveForCursor}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    />
  );
}
