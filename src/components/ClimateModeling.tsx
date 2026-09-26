import { useState, useEffect, useRef } from 'react';
import { Globe, Play, Activity, Settings, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function ClimateModeling() {
  const [resolution, setResolution] = useState<'10KM' | '5KM' | '1KM'>('5KM');
  const [isSimulating, setIsSimulating] = useState(false);
  const [entropy, setEntropy] = useState(1.42);
  const [calculationsTotal, setCalculationsTotal] = useState(0);
  const [fps, setFps] = useState(0);
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

    // Weather grid points
    let cols = 15;
    let rows = 10;
    let flowField: { x: number; y: number; u: number; v: number; t: number }[] = [];

    const initGrid = () => {
      cols = resolution === '10KM' ? 12 : resolution === '5KM' ? 24 : 36;
      rows = resolution === '10KM' ? 8 : resolution === '5KM' ? 16 : 24;
      flowField = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          flowField.push({
            x: (c / (cols - 1)) * width,
            y: (r / (rows - 1)) * height,
            u: 0,
            v: 0,
            t: 15 + Math.random() * 10 // Simulated air temp in C
          });
        }
      }
    };
    initGrid();

    let time = 0;

    const renderLoop = () => {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      time += isSimulating ? 0.05 : 0.005;

      // Draw isobar lines and vector winds
      flowField.forEach((point, i) => {
        // Calculate chaotic turbulence with nested Sine and Cosine waves
        point.u = Math.sin(point.y * 0.01 + time + Math.cos(point.x * 0.01)) * (isSimulating ? 18 : 3);
        point.v = Math.cos(point.x * 0.01 - time + Math.sin(point.y * 0.01)) * (isSimulating ? 18 : 3);
        point.t = 15 + Math.sin(point.x * 0.002 + time) * 8 + Math.cos(point.y * 0.002) * 5;

        // Visual grid coordinates node circles
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
          ctx.fillStyle = `rgba(16, 185, 129, ${Math.max(0.05, Math.min(1, 0.1 + (point.t / 40)))})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();

          // Wind vector lines representing flow fields
          const endX = point.x + point.u;
          const endY = point.y + point.v;
          if (Number.isFinite(endX) && Number.isFinite(endY)) {
            ctx.strokeStyle = `rgba(16, 185, 129, ${isSimulating ? 0.6 : 0.25})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw small tip line
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(endX, endY, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // Overlay an isobar contour (isobar ring simulation)
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.15)';
      ctx.lineWidth = 1;
      for (let r = 50; r < Math.min(width, height); r += 40) {
        const radius = Math.max(1, r + Math.sin(time) * 10);
        if (Number.isFinite(radius)) {
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (isSimulating) {
        setCalculationsTotal(prev => prev + (resolution === '10KM' ? 144 : resolution === '5KM' ? 576 : 1296));
        setFps(() => Math.floor(58 + Math.random() * 4));
        setEntropy(() => parseFloat((1.1 + Math.random() * 0.5).toFixed(3)));
      } else {
        setFps(0);
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [resolution, isSimulating]);

  return (
    <div className="border border-emerald-500/20 bg-zinc-950 p-4 rounded-lg flex flex-col gap-4 text-mono shadow-[0_0_20px_rgba(16,185,129,0.05)]">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-emerald-550" />
          <span className="text-xs font-black uppercase text-emerald-400">Atmospheric Climate Modeling Sector</span>
        </div>
        <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
          Dual-Axis Thermodynamic Grid Lock: ACTIVE
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dynamic Map Render Panel */}
        <div className="lg:col-span-2 bg-black border border-zinc-900 rounded p-1 relative h-[250px] overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className="absolute top-3 left-3 bg-black/80 px-2.5 py-1 text-[9px] text-[#00FFCC] border border-zinc-800 rounded font-black uppercase">
            Grid Scale: {resolution === '10KM' ? '10-Kilometer Regional' : resolution === '5KM' ? '5-Kilometer Civil' : '1-Kilometer Precision'}
          </div>
          <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-1 text-[9px] text-white/50 border border-zinc-800 rounded font-black uppercase">
            CALCS RUN: {calculationsTotal.toLocaleString()} vectors
          </div>
        </div>

        {/* Dashboard Side options panel */}
        <div className="border border-zinc-900 bg-zinc-950 p-3 rounded flex flex-col justify-between">
          <div className="space-y-4">
            {/* Setting Grid density */}
            <div>
              <div className="text-[9px] text-white/40 font-black uppercase tracking-wider mb-2">Resolution Gridding</div>
              <div className="grid grid-cols-3 gap-1">
                {(['10KM', '5KM', '1KM'] as const).map(res => (
                  <button
                    key={res}
                    onClick={() => { setResolution(res); setCalculationsTotal(0); }}
                    className={`py-1.5 text-[9px] font-black border rounded transition-all ${resolution === res ? 'bg-emerald-500/25 border-emerald-500 text-emerald-400' : 'border-zinc-800 text-white/50 hover:text-white'}`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            {/* Calculations metrics */}
            <div className="bg-black p-3 border border-zinc-900 rounded space-y-1.5">
              <div className="flex justify-between items-center text-[10px] uppercase font-black">
                <span className="text-white/40">Solving Speed:</span>
                <span className="text-emerald-400">{isSimulating ? `${fps} fps` : '0 fps'}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] uppercase font-black">
                <span className="text-white/40">Atmospheric Entropy:</span>
                <span className="text-white">{entropy.toFixed(3)} η</span>
              </div>
              <div className="flex justify-between items-center text-[10px] uppercase font-black">
                <span className="text-white/40">Morris Law Locking:</span>
                <span className="text-emerald-400">1.0000 NOMINAL</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-3">
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`w-full py-2.5 text-xs font-black uppercase tracking-wider border rounded transition-all flex items-center justify-center gap-2 ${isSimulating ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500 hover:text-black'}`}
            >
              {isSimulating ? "HALT CLIMATE SIM" : "SOLVE ATMOSPHERIC CORE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
