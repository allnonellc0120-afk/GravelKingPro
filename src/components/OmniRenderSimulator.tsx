import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, Layers, Sliders, Cpu, Activity } from 'lucide-react';
import { motion } from 'motion/react';

export default function OmniRenderSimulator() {
  const [renderTarget, setRenderTarget] = useState<'8K' | '4K' | 'HDR'>('8K');
  const [isRendering, setIsRendering] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const totalFrames = 300;
  const [fps, setFps] = useState(0);
  const [temp, setTemp] = useState(42);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = Math.max(canvas.clientWidth || 0, 300));
    let height = (canvas.height = Math.max(canvas.clientHeight || 0, 180));

    const handleResize = () => {
      width = canvas.width = Math.max(canvas.clientWidth || 0, 300);
      height = canvas.height = Math.max(canvas.clientHeight || 0, 180);
    };
    window.addEventListener('resize', handleResize);

    let particles: { x: number; y: number; r: number; color: string; vx: number; vy: number }[] = [];
    const initParticles = () => {
      particles = [];
      for (let i = 0; i < 150; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 1 + Math.random() * 3,
          color: renderTarget === '8K' ? `rgba(255, 0, 255, ${0.3 + Math.random() * 0.5})` :
                 renderTarget === '4K' ? `rgba(0, 255, 204, ${0.3 + Math.random() * 0.5})` :
                                         `rgba(212, 175, 55, ${0.3 + Math.random() * 0.5})`,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2
        });
      }
    };
    initParticles();

    let angle = 0;

    const renderLoop = () => {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, width, height);

      // Render some sci-fi wireframes
      ctx.strokeStyle = renderTarget === '8K' ? 'rgba(255, 0, 255, 0.15)' : 'rgba(0, 255, 204, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < width; i += 30) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
      }
      for (let i = 0; i < height; i += 30) {
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
      }
      ctx.stroke();

      // Draw particle cluster
      particles.forEach(p => {
        p.x += p.vx * (isRendering ? 3.5 : 0.4);
        p.y += p.vy * (isRendering ? 3.5 : 0.4);

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.r) && p.r > 0) {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Connect particles within proximity
        particles.forEach(p2 => {
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 45 && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p2.x) && Number.isFinite(p2.y)) {
            ctx.strokeStyle = renderTarget === '8K' ? `rgba(255, 0, 255, ${Math.max(0, 0.12 - dist/400)})` :
                             renderTarget === '4K' ? `rgba(0, 255, 204, ${Math.max(0, 0.12 - dist/400)})` :
                                                     `rgba(212, 175, 55, ${Math.max(0, 0.12 - dist/400)})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      // Complex mathematical spirals to show core 1T intensity VFX
      angle += isRendering ? 0.04 : 0.005;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(angle);
      ctx.strokeStyle = renderTarget === '8K' ? 'rgba(255, 0, 255, 0.4)' : 'rgba(0, 255, 204, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 360; i += 12) {
        const rad = (i * Math.PI) / 180;
        const r = Math.max(1, (isRendering ? 90 : 60) + Math.sin(angle * 3 + i) * 15);
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        if (Number.isFinite(x) && Number.isFinite(y)) {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      if (isRendering) {
        setFrameIndex(prev => {
          if (prev >= totalFrames) {
            setIsRendering(false);
            return totalFrames;
          }
          return prev + 1;
        });
        setFps(() => Math.floor(138 + Math.random() * 15));
        setTemp(t => Math.min(84, t + (Math.random() * 0.15)));
      } else {
        setFps(0);
        setTemp(t => Math.max(42, t - (Math.random() * 0.3)));
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRendering, renderTarget]);

  const progressPercent = (frameIndex / totalFrames) * 100;

  return (
    <div className="border border-[#FF00FF]/20 bg-zinc-950 p-4 rounded-lg flex flex-col gap-4 text-mono shadow-[0_0_20px_rgba(255,0,255,0.05)]">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-[#FF00FF]" />
          <span className="text-xs font-black uppercase text-[#FF00FF]">OmniRender 8K Raytracing Studio</span>
        </div>
        <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
          Morris Law Kernel GPU Lock: ACTIVE
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Render Canvas */}
        <div className="lg:col-span-2 bg-black border border-zinc-900 rounded p-1 relative h-[250px] overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className="absolute top-3 left-3 bg-black/80 px-2 py-1 text-[9px] text-[#FF00FF] border border-[#FF00FF]/30 font-black tracking-wider uppercase rounded">
            Viewport: {renderTarget} UHD Studio
          </div>
          <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-1 text-[9px] text-white/60 border border-zinc-800 rounded font-black uppercase">
            Frame: {frameIndex} / {totalFrames}
          </div>
        </div>

        {/* Controls Console */}
        <div className="border border-zinc-900 bg-zinc-950 p-3 rounded flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <div className="text-[9px] text-white/40 font-black uppercase tracking-wider mb-2">Resolution Targets</div>
              <div className="grid grid-cols-3 gap-1">
                {(['8K', '4K', 'HDR'] as const).map(target => (
                  <button
                    key={target}
                    onClick={() => { setRenderTarget(target); setFrameIndex(0); }}
                    className={`py-1.5 text-[10px] uppercase font-black tracking-wider border rounded transition-all ${renderTarget === target ? 'bg-[#FF00FF]/20 border-[#FF00FF] text-[#FF00FF]' : 'border-zinc-800 text-white/50 hover:text-white hover:border-zinc-700'}`}
                  >
                    {target === '8K' ? '8K Ultra' : target === '4K' ? '4K Cine' : 'HDR Pro'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-black border border-zinc-900 rounded space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase">
                <span className="text-white/40">Render Velocity:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Activity size={10} /> {fps} fps
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] uppercase">
                <span className="text-white/40">GPU Core Temp:</span>
                <span className={`font-bold ${temp > 75 ? 'text-red-400' : 'text-[#FF00FF]'}`}>
                  {temp.toFixed(1)}°C
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] uppercase">
                <span className="text-white/40">Parity Core Lock:</span>
                <span className="text-[#00FFCC] font-bold">1.0000 STABLE</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => {
                if (frameIndex >= totalFrames) setFrameIndex(0);
                setIsRendering(!isRendering);
              }}
              className={`w-full py-2 text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border rounded ${isRendering ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-[#FF00FF]/15 border-[#FF00FF] text-[#FF00FF] hover:bg-[#FF00FF] hover:text-black'}`}
            >
              {isRendering ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
              {isRendering ? "HALT RAYTRACING" : frameIndex >= totalFrames ? "RESTART RENDER" : "LAUNCH 1T RAYTRACING"}
            </button>
            <button
              onClick={() => { setIsRendering(false); setFrameIndex(0); }}
              className="w-full border border-zinc-800 text-white/40 hover:text-white py-1.5 text-[9px] uppercase font-black rounded flex items-center justify-center gap-1"
            >
              <RefreshCw size={10} /> Reset Queue
            </button>
          </div>
        </div>
      </div>

      {/* Frame Queue Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] uppercase font-black text-white/50">
          <span>RAYTRACING FRAME CACHE:</span>
          <span>{progressPercent.toFixed(1)}% ({frameIndex} / 300 F)</span>
        </div>
        <div className="w-full h-2 bg-zinc-900 rounded overflow-hidden relative">
          <div
            className="h-full bg-[#FF00FF]"
            style={{ width: `${progressPercent}%`, transition: 'width 100ms linear' }}
          />
        </div>
      </div>
    </div>
  );
}
