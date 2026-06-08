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
  onSeek?: (seconds: number) => void;
  onRegionChange?: (region: Region | null) => void;
}

export function Waveform({
  peaks, duration, position, region, color,
  height = 64, onSeek, onRegionChange,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startTime: number } | null>(null);
  const rafRef = useRef<number>(0);
  const propsRef = useRef({ peaks, duration, position, region, color, height });
  propsRef.current = { peaks, duration, position, region, color, height };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { peaks, duration, position, region, color } = propsRef.current;
    const W = canvas.width;
    const H = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);

    // Region highlight
    if (region && duration > 0) {
      const rx1 = (region.start / duration) * W;
      const rx2 = (region.end / duration) * W;
      ctx.fillStyle = "rgba(245,158,11,0.15)";
      ctx.fillRect(rx1, 0, rx2 - rx1, H);
      ctx.fillStyle = "rgba(245,158,11,0.5)";
      ctx.fillRect(rx1, 0, 1, H);
      ctx.fillRect(rx2, 0, 1, H);
    }

    // Waveform bars
    if (peaks.length > 0) {
      const barW = Math.max(1, W / peaks.length);
      const mid = H / 2;
      for (let i = 0; i < peaks.length; i++) {
        const x = (i / peaks.length) * W;
        const h = Math.max(2, peaks[i] * H * 0.85);
        const alpha = position > 0 && duration > 0 && (i / peaks.length) < (position / duration) ? 1.0 : 0.55;
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

    // Playhead
    if (duration > 0) {
      const px = (position / duration) * W;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Playhead triangle
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
    return pct * (propsRef.current.duration || 0);
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
