import { useRef, useEffect, useCallback } from "react";

interface Region {
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
  onSeek?: (seconds: number) => void;
  onRegionChange?: (region: Region | null) => void;
}

export function Waveform({
  peaks, duration, position, region, color,
  height = 64, zoom = 1, scrollOffset = 0,
  onSeek, onRegionChange,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startTime: number } | null>(null);
  const rafRef = useRef<number>(0);
  const propsRef = useRef({ peaks, duration, position, region, color, height, zoom, scrollOffset });
  propsRef.current = { peaks, duration, position, region, color, height, zoom, scrollOffset };

  const getViewWindow = () => {
    const { duration, zoom, scrollOffset } = propsRef.current;
    const viewFrac = 1 / Math.max(1, zoom);
    const maxStart = 1 - viewFrac;
    const startFrac = Math.max(0, Math.min(maxStart, scrollOffset));
    return { startFrac, endFrac: startFrac + viewFrac, startTime: startFrac * duration, endTime: (startFrac + viewFrac) * duration };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { peaks, duration, position, region, color } = propsRef.current;
    const { startFrac, endFrac, startTime, endTime } = getViewWindow();
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;   // CSS pixels (ctx is already scaled by DPR)
    const H = canvas.height / dpr;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);

    // Region highlight (mapped to visible window)
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

    // Waveform bars — render only visible slice of peaks
    if (peaks.length > 0) {
      const iStart = Math.floor(startFrac * peaks.length);
      const iEnd = Math.ceil(endFrac * peaks.length);
      const visible = peaks.slice(iStart, iEnd);
      const barW = Math.max(1, W / visible.length);
      const mid = H / 2;
      for (let i = 0; i < visible.length; i++) {
        const x = (i / visible.length) * W;
        const h = Math.max(2, visible[i] * H * 0.85);
        const tAtBar = startTime + ((i + 0.5) / visible.length) * (endTime - startTime);
        const alpha = position > 0 && duration > 0 && tAtBar < position ? 1.0 : 0.55;
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

    // Playhead (mapped to visible window)
    if (duration > 0 && position >= startTime && position <= endTime) {
      const px = ((position / duration - startFrac) / (endFrac - startFrac)) * W;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
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
      canvas.width = rect.width * dpr;
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

  const getTime = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const { startTime, endTime } = getViewWindow();
    return startTime + pct * (endTime - startTime);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const t = getTime(e);
    dragRef.current = { startX: e.clientX, startTime: t };
    if (onRegionChange) onRegionChange(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    if (dx < 4) return;
    const t2 = getTime(e);
    const start = Math.min(dragRef.current.startTime, t2);
    const end = Math.max(dragRef.current.startTime, t2);
    if (onRegionChange) onRegionChange({ start, end });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    if (dx < 4 && onSeek) {
      onSeek(dragRef.current.startTime);
      if (onRegionChange) onRegionChange(null);
    }
    dragRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded cursor-crosshair"
      style={{ height, display: "block" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { dragRef.current = null; }}
    />
  );
}
