import { useState, useEffect, useRef } from 'react';
import { Rocket, Play, Activity, RefreshCw, Box } from 'lucide-react';
import { motion } from 'motion/react';

export default function IndiePhysics() {
  const [gravity, setGravity] = useState<number>(0.15);
  const [isSimulating, setIsSimulating] = useState(false);
  const [viscosity, setViscosity] = useState<number>(0.99);
  const [fps, setFps] = useState(60);
  const [activeParticles, setActiveParticles] = useState(80);
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

    // Ball/Particle arrays
    let ballList: { x: number; y: number; vx: number; vy: number; r: number; color: string }[] = [];
    const initParticles = () => {
      ballList = [];
      const colors = ['#EC4899', '#ED64A6', '#F472B6', '#3B82F6', '#00FFCC'];
      const safeW = Math.max(width, 100);
      const safeH = Math.max(height, 100);
      for (let i = 0; i < activeParticles; i++) {
        ballList.push({
          x: 40 + Math.random() * (safeW - 80),
          y: 40 + Math.random() * (safeH - 80),
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          r: 5 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    };
    initParticles();

    const renderLoop = () => {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 20 || height <= 20) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      ctx.fillStyle = '#05020c';
      ctx.fillRect(0, 0, width, height);

      // Boundary box
      ctx.strokeStyle = '#2d1b4e';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, Math.max(1, width - 20), Math.max(1, height - 20));

      // Render static structural collision block (e.g. circle in middle)
      const obstacleX = width / 2;
      const obstacleY = height / 2;
      const obstacleR = 45;

      if (Number.isFinite(obstacleX) && Number.isFinite(obstacleY)) {
        ctx.fillStyle = '#1e1135';
        ctx.strokeStyle = '#EC4899';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(obstacleX, obstacleY, obstacleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Update and draw fluid physics balls
      ballList.forEach((b) => {
        if (isSimulating) {
          // Physics laws
          b.vy += gravity; // Gravity pull downward
          b.vx *= viscosity; // Viscous resistance drag
          b.vy *= viscosity;

          b.x += b.vx;
          b.y += b.vy;

          // Boundary bounce collisions (factoring box margins of 10)
          if (b.x < 10 + b.r) {
            b.x = 10 + b.r;
            b.vx *= -0.85;
          }
          if (b.x > width - 10 - b.r) {
            b.x = width - 10 - b.r;
            b.vx *= -0.85;
          }
          if (b.y < 10 + b.r) {
            b.y = 10 + b.r;
            b.vy *= -0.85;
          }
          if (b.y > height - 10 - b.r) {
            b.y = height - 10 - b.r;
            b.vy *= -0.85;
          }

          // Static block collision checks
          const distance = Math.hypot(b.x - obstacleX, b.y - obstacleY);
          if (distance < obstacleR + b.r && distance > 0.001) {
            // Deflect angle calculations
            const angle = Math.atan2(b.y - obstacleY, b.x - obstacleX);
            b.x = obstacleX + Math.cos(angle) * (obstacleR + b.r);
            b.y = obstacleY + Math.sin(angle) * (obstacleR + b.r);

            // Reflected vector calculations
            const dot = b.vx * Math.cos(angle) + b.vy * Math.sin(angle);
            b.vx -= 2 * dot * Math.cos(angle);
            b.vy -= 2 * dot * Math.sin(angle);

            // Attenuate
            b.vx *= 0.85;
            b.vy *= 0.85;
          }

          // Ball-to-ball elastic collisions
          ballList.forEach((b2) => {
            if (b === b2) return;
            const dist = Math.hypot(b.x - b2.x, b.y - b2.y);
            if (dist < b.r + b2.r && dist > 0.001) {
              const overlap = (b.r + b2.r) - dist;
              const angle = Math.atan2(b.y - b2.y, b.x - b2.x);
              
              // Push away
              b.x += Math.cos(angle) * (overlap / 2);
              b.y += Math.sin(angle) * (overlap / 2);
              b2.x -= Math.cos(angle) * (overlap / 2);
              b2.y -= Math.sin(angle) * (overlap / 2);

              // Exchange velocities
              const tempVx = b.vx;
              const tempVy = b.vy;
              b.vx = b2.vx * 0.85;
              b.vy = b2.vy * 0.85;
              b2.vx = tempVx * 0.85;
              b2.vy = tempVy * 0.85;
            }
          });
        }

        // Draw particle node
        if (Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.r) && b.r > 0) {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.stroke();
        }
      });

      if (isSimulating) {
        setFps(() => Math.floor(59 + Math.random() * 2));
      } else {
        setFps(60);
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gravity, isSimulating, viscosity, activeParticles]);

  return (
    <div className="border border-pink-500/20 bg-zinc-950 p-4 rounded-lg flex flex-col gap-4 text-mono shadow-[0_0_20px_rgba(236,72,153,0.05)]">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-pink-550" />
          <span className="text-xs font-black uppercase text-pink-400">indie Raytrace particle physics simulator</span>
        </div>
        <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
          Morris Law Silicon collision engine: LOCKED
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Phys Canvas */}
        <div className="lg:col-span-2 bg-black border border-zinc-900 rounded p-1 relative h-[250px] overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className="absolute top-3 left-3 bg-black/80 px-2 py-1 text-[9px] text-[#00FFCC] border border-zinc-800 rounded font-black uppercase">
            RigidBody Mechanics Simulation
          </div>
          <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-1 text-[9px] text-zinc-500 border border-zinc-800 rounded font-black uppercase">
            STATE: {isSimulating ? "RUNNING (1T CORE)" : "PAUSED"}
          </div>
        </div>

        {/* Console Side Controls */}
        <div className="border border-zinc-900 bg-zinc-950 p-3 rounded flex flex-col justify-between">
          <div className="space-y-3">
            {/* Gravity slider */}
            <div>
              <div className="flex justify-between text-[9px] text-white/40 font-black uppercase mb-1">
                <span>SIMULATED GRAVITY</span>
                <span className="text-pink-400">{gravity.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={gravity}
                onChange={(e) => setGravity(parseFloat(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>

            {/* Drag viscosity */}
            <div>
              <div className="flex justify-between text-[9px] text-white/40 font-black uppercase mb-1">
                <span>Medium Viscosity</span>
                <span className="text-pink-400">{viscosity.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.9"
                max="1.0"
                step="0.01"
                value={viscosity}
                onChange={(e) => setViscosity(parseFloat(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>

            {/* Particle volume */}
            <div>
              <div className="flex justify-between text-[9px] text-white/40 font-black uppercase mb-1">
                <span>Particle volume count</span>
                <span className="text-white">{activeParticles}</span>
              </div>
              <input
                type="range"
                min="10"
                max="150"
                step="5"
                value={activeParticles}
                onChange={(e) => setActiveParticles(parseInt(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>

            {/* Live FPS */}
            <div className="bg-black p-2 border border-zinc-900 rounded flex justify-between items-center text-[10px] uppercase font-black">
              <span className="text-white/40">Collision Speed:</span>
              <span className="text-emerald-400 font-bold">{fps} fps</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-3">
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`w-full py-2.5 text-xs font-black uppercase tracking-wider border rounded transition-all flex items-center justify-center gap-2 ${isSimulating ? 'bg-red-500/15 border-red-500 text-red-400' : 'bg-pink-500/15 border-pink-500 text-pink-400 hover:bg-pink-500 hover:text-black'}`}
            >
              {isSimulating ? "FREEZE COLLISION SPACE" : "DISSOLVE SOLID BODIES"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
