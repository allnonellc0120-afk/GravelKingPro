import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from "react";

export interface WaveformScrubberHandle {
  setPosition: (pct: number) => void;
  getPosition: () => number;
}

interface Props {
  points: number[];
  duration: number;
  onSeek: (pct: number) => void;
  accentColor?: string;
  height?: number;
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const WaveformScrubber = forwardRef<WaveformScrubberHandle, Props>(
  ({ points, duration, onSeek, accentColor = "#f59e0b", height = 88 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const posRef = useRef(0);
    const draggingRef = useRef(false);

    const draw = useCallback(
      (pos: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        const LABEL_H = 14;
        const waveH = H - LABEL_H;

        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void }).roundRect(0, 0, W, H, 6);
        ctx.fill();

        const playedX = pos * W;

        if (points.length > 0) {
          const barW = W / points.length;
          for (let i = 0; i < points.length; i++) {
            const x = i * barW;
            const barH = Math.max(2, points[i] * (waveH - 8));
            const y = (waveH - barH) / 2;
            const isPast = x < playedX;
            ctx.globalAlpha = isPast ? 0.88 : 0.3;
            ctx.fillStyle = isPast ? accentColor : "#64748b";
            ctx.beginPath();
            (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void }).roundRect(
              x + 0.5,
              y,
              Math.max(1, barW - 1),
              barH,
              1
            );
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, waveH / 2);
          ctx.lineTo(W, waveH / 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Upload and process audio to see waveform", W / 2, waveH / 2 + 4);
        }

        if (pos > 0.002 && pos < 0.998) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(playedX, 2);
          ctx.lineTo(playedX, waveH - 4);
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 8;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(playedX, waveH / 2, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 12;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(playedX, waveH / 2, 3, 0, Math.PI * 2);
          ctx.fillStyle = accentColor;
          ctx.shadowBlur = 0;
          ctx.fill();
          ctx.restore();
        }

        const elapsed = pos * duration;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(fmtTime(elapsed), 6, H - 3);
        ctx.textAlign = "right";
        ctx.fillText(fmtTime(duration), W - 6, H - 3);

        if (pos > 0 && pos < 1) {
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.textAlign = "center";
          ctx.fillText(fmtTime(elapsed), Math.max(30, Math.min(W - 30, playedX)), H - 3);
        }
      },
      [points, duration, accentColor]
    );

    useImperativeHandle(ref, () => ({
      setPosition: (pct: number) => {
        posRef.current = pct;
        draw(pct);
      },
      getPosition: () => posRef.current,
    }));

    useEffect(() => {
      draw(posRef.current);
    }, [draw]);

    const getPct = (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      draggingRef.current = true;
      const pct = getPct(e.clientX);
      posRef.current = pct;
      draw(pct);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!draggingRef.current) return;
      const pct = getPct(e.clientX);
      posRef.current = pct;
      draw(pct);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const pct = getPct(e.clientX);
      posRef.current = pct;
      draw(pct);
      onSeek(pct);
    };

    return (
      <canvas
        ref={canvasRef}
        width={600}
        height={height}
        className="w-full rounded-lg cursor-pointer select-none"
        style={{ height, display: "block" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    );
  }
);
WaveformScrubber.displayName = "WaveformScrubber";
