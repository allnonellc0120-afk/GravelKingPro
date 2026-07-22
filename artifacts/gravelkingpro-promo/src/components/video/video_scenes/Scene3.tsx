import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { CharacterVideo } from './CharacterVideo';

function LSBWaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let t = 0;

    const render = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Draw active waveform
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 229, 0.8)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00FFE5';
      ctx.shadowBlur = 15;

      for (let x = 0; x < w; x += 2) {
        // Create a complex waveform combining sine waves
        const amp = Math.sin(x * 0.01 + t * 2) * 50 
                  + Math.sin(x * 0.05 - t * 3) * 20 
                  + Math.sin(x * 0.005 + t) * 80;
        
        const y = mid + amp;
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        // Draw data bits injecting into the peaks
        if (x % 40 === 0 && Math.abs(amp) > 40) {
          const bitY = amp > 0 ? y - 40 + (t * 20 % 40) : y + 40 - (t * 20 % 40);
          ctx.fillStyle = '#F5A623';
          ctx.shadowColor = '#F5A623';
          ctx.shadowBlur = 10;
          ctx.font = '10px monospace';
          const bits = ['1', '0'];
          const randomBit = bits[Math.floor((x + t) % 2)];
          ctx.fillText(randomBit, x - 3, bitY);
        }
      }
      ctx.stroke();

      t += 0.05;
      animationId = requestAnimationFrame(render);
    };
    render();

    return () => cancelAnimationFrame(animationId);
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

export function Scene3() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Background Active Waveform */}
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-screen">
        <LSBWaveformCanvas />
      </div>

      <div className="relative z-10 w-full h-full flex items-center justify-center gap-[6vw] px-[5vw]">
        
        {/* Left Side: Content */}
        <div className="flex flex-col items-start w-[50vw]">
          <div className="flex items-center gap-[2vw] mb-[3vh]">
            {/* GravelKing Lightning Bolt */}
            <motion.svg
              viewBox="0 0 24 24"
              className="w-[5vw] h-[5vw] drop-shadow-[0_0_15px_rgba(245,166,35,0.8)]"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#F5A623" />
            </motion.svg>
            <motion.h2 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-[3.5vw] font-bold uppercase tracking-tighter text-white"
            >
              GravelKing Pro <br/>
              <span className="text-[#00FFE5] drop-shadow-[0_0_10px_rgba(0,255,229,0.8)]">MLK V3.5</span>
            </motion.h2>
          </div>

          <div className="flex flex-col gap-[2vh]">
            {[
              "Signal-Level LSB Steganography",
              "Dual-Anchor Server Handshake (Anchor A + B)",
              "Default of Warrant on Alteration"
            ].map((text, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.4, duration: 0.5 }}
                className="flex items-center gap-[1vw] text-[1.5vw] font-mono text-[#e4e4e7]"
              >
                <div className="w-[0.8vw] h-[0.8vw] bg-[#F5A623] shadow-[0_0_10px_rgba(245,166,35,0.8)] rotate-45" />
                {text}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Side: Character */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="flex-shrink-0"
        >
          <CharacterVideo 
            className="w-[30vw]" 
            dialogue="FIRE! FIRE! This is cool!" 
            speaker="left"
          />
        </motion.div>

      </div>
    </motion.div>
  );
}
