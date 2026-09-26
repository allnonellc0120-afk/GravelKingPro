import { useRef, useEffect } from 'react';
import { cn } from '@/src/lib/utils';

export function CanvasWaveform({ isProcessing, isPaidTier }: { isProcessing: boolean, isPaidTier: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let offset = 0;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      const clientW = parent ? parent.clientWidth : 0;
      canvas.width = Math.max(clientW, 300);
      canvas.height = 140; // clean vertical height matching container
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      if (!ctx || !canvas) return;
      
      const width = Math.max(1, canvas.width || 300);
      const height = Math.max(1, canvas.height || 140);
      
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      ctx.fillStyle = '#09090b'; // matching zinc-950 dark background color
      ctx.fillRect(0, 0, width, height);

      // Draw horizontal/vertical glowing neon-cyan raster gridlines
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.04)';
      ctx.lineWidth = 1;
      
      // Horizontal grid lines
      for (let y = 0; y < height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vertical grid lines
      for (let x = 0; x < width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Dynamic sweep oscilloscope radar line scanning across the matrix
      const rawSweep = Number.isFinite(offset) ? (offset * 1.8) % width : 0;
      const sweepX = Number.isFinite(rawSweep) ? Math.max(0, Math.min(width, rawSweep)) : 0;
      const gradStart = Math.max(0, sweepX - 45);
      const gradEnd = Math.max(gradStart + 0.1, sweepX);

      if (Number.isFinite(gradStart) && Number.isFinite(gradEnd)) {
        try {
          const sweepGrad = ctx.createLinearGradient(gradStart, 0, gradEnd, 0);
          sweepGrad.addColorStop(0, 'rgba(0, 255, 204, 0)');
          sweepGrad.addColorStop(1, 'rgba(0, 255, 204, 0.15)');
          ctx.fillStyle = sweepGrad;
          ctx.fillRect(gradStart, 0, Math.max(1, gradEnd - gradStart), height);
        } catch {
          // Fallback if gradient fails
        }
      }

      // Multiple Overlapping Waveforms reflecting active process stress
      const numWaves = 3;
      const colors = ['#00FFCC', '#D4AF37', '#a78bfa']; // turquoise green, gold, amethyst
      const glowColors = ['rgba(0,255,204,0.3)', 'rgba(212,175,55,0.3)', 'rgba(167,139,250,0.3)'];
      
      const speed = isProcessing ? 0.12 : 0.03;
      const baseAmplitude = isProcessing ? 35 : 12;

      for (let w = 0; w < numWaves; w++) {
        ctx.beginPath();
        ctx.strokeStyle = colors[w];
        ctx.lineWidth = w === 0 ? 2 : 1;
        ctx.shadowColor = glowColors[w];
        ctx.shadowBlur = isPaidTier ? 10 : 0; // high-fidelity neon-glow is only unlocked on premium tier

        const amplitude = baseAmplitude * (1 - w * 0.25);
        const frequency = 0.015 * (1 + w * 0.2);
        let pathStarted = false;

        for (let x = 0; x < width; x++) {
          const sinInput = (x + offset) * frequency;
          const y = (height / 2) + Math.sin(sinInput) * amplitude * Math.sin(offset * 0.012 + w);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            if (!pathStarted) {
              ctx.moveTo(x, y);
              pathStarted = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      }

      // Reset shadows
      ctx.shadowBlur = 0;

      // Render diagnostic console stream telemetry overlays on canvas
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '8px monospace';
      ctx.fillText(`SWEEP_FREQUENCY: ${(speed * 100).toFixed(1)}HZ // HARMONIC_MATRIX_CHANNELS: [35_CH_RESOLVER]`, 12, 16);

      if (isProcessing) {
        ctx.fillStyle = '#00FFCC';
        ctx.fillText(`DYNAMICS ACTIVE: 100% REAL-TIME CONCURRENCY LOAD`, Math.max(10, width - 250), 16);
      } else {
        ctx.fillStyle = 'rgba(167,139,250,0.6)';
        ctx.fillText(`STANDBY TELEMETRY STREAM MONITORING [OK]`, Math.max(10, width - 210), 16);
      }

      offset += isProcessing ? 4.0 : 1.0;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isProcessing, isPaidTier]);

  return (
    <div className="w-full relative overflow-hidden bg-zinc-950 rounded">
      <canvas 
        ref={canvasRef} 
        className={cn(
          "w-full h-[140px] block transition-all duration-505",
          !isPaidTier ? "blur-[6px] grayscale select-none opacity-40" : "blur-0"
        )}
      />
    </div>
  );
}
