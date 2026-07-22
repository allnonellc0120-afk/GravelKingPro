import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { CharacterVideo } from './CharacterVideo';

function FlatWaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    
    const render = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      
      ctx.clearRect(0, 0, w, h);
      
      // Draw grid
      ctx.strokeStyle = 'rgba(0, 255, 229, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      
      // Draw flatline waveform with slight jitter
      ctx.beginPath();
      ctx.strokeStyle = '#F5A623';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#F5A623';
      ctx.shadowBlur = 10;
      
      for (let x = 0; x < w; x += 4) {
        // almost flat, some occasional noise
        const noise = Math.random() < 0.03 ? (Math.random() - 0.5) * 25 : (Math.random() - 0.5) * 3;
        const y = mid + noise;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      animationId = requestAnimationFrame(render);
    };
    render();
    
    return () => cancelAnimationFrame(animationId);
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full opacity-80" />;
}

export function Scene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 z-0">
        <FlatWaveformCanvas />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mb-[4vh]"
        >
          <CharacterVideo 
            className="w-[20vw]" 
            dialogue="Uh... this sucks." 
            speaker="beavis"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
          className="text-center"
        >
          <h1 className="text-[4vw] font-bold tracking-tighter text-white uppercase drop-shadow-[0_0_15px_rgba(245,166,35,0.8)]">
            <motion.span
              animate={{ opacity: [1, 0.5, 1, 0.8, 1], x: [0, -2, 2, -1, 0] }}
              transition={{ repeat: Infinity, duration: 2, repeatType: "mirror" }}
              className="inline-block"
            >
              Passive Timestamps
            </motion.span>
            <br />
            <span className="text-[#F5A623]">Are Obsolete.</span>
          </h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="text-[1.5vw] text-[#71717a] mt-[2vh] max-w-[50vw] mx-auto uppercase tracking-wide font-mono"
          >
            External ledgers can't protect your actual audio.
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  );
}
