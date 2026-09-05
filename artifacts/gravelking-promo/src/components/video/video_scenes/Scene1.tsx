import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [soundReady, setSoundReady] = useState(false);

  useEffect(() => {
    // We delay the web audio context creation to ensure interaction or just let it play if allowed
    const playAudio = async () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        
        // 1. Low sub pulse (0.0s to 4.0s)
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(30, ctx.currentTime);
        subOsc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 2.0);
        subGain.gain.setValueAtTime(0, ctx.currentTime);
        subGain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 1.0);
        subGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 4.0);
        subOsc.connect(subGain);
        subGain.connect(ctx.destination);
        subOsc.start(ctx.currentTime);
        subOsc.stop(ctx.currentTime + 4.0);

        // 2. Computer chirp (synchronised to beam at 1.0s)
        const chirpTime = ctx.currentTime + 1.0;
        const chirpOsc = ctx.createOscillator();
        const chirpGain = ctx.createGain();
        chirpOsc.type = 'square';
        chirpOsc.frequency.setValueAtTime(800, chirpTime);
        chirpOsc.frequency.exponentialRampToValueAtTime(1200, chirpTime + 0.1);
        chirpOsc.frequency.exponentialRampToValueAtTime(600, chirpTime + 0.2);
        chirpGain.gain.setValueAtTime(0, chirpTime);
        chirpGain.gain.linearRampToValueAtTime(0.3, chirpTime + 0.05);
        chirpGain.gain.exponentialRampToValueAtTime(0.01, chirpTime + 0.3);
        chirpOsc.connect(chirpGain);
        chirpGain.connect(ctx.destination);
        chirpOsc.start(chirpTime);
        chirpOsc.stop(chirpTime + 0.3);

        // 3. Metallic ring scrape/resonance (synchronised to ring rotation at 2.5s)
        const ringTime = ctx.currentTime + 2.5;
        const ringOsc = ctx.createOscillator();
        const ringGain = ctx.createGain();
        ringOsc.type = 'triangle';
        ringOsc.frequency.setValueAtTime(400, ringTime);
        ringOsc.frequency.linearRampToValueAtTime(420, ringTime + 1.5);
        ringGain.gain.setValueAtTime(0, ringTime);
        ringGain.gain.linearRampToValueAtTime(0.15, ringTime + 0.5);
        ringGain.gain.linearRampToValueAtTime(0.05, ringTime + 1.5);
        ringGain.gain.exponentialRampToValueAtTime(0.01, ringTime + 3.0);
        ringOsc.connect(ringGain);
        ringGain.connect(ctx.destination);
        ringOsc.start(ringTime);
        ringOsc.stop(ringTime + 3.0);
        
        setSoundReady(true);
      } catch (e) {
        console.warn("Audio context failed (might need user interaction):", e);
      }
    };
    
    playAudio();
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10 bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 1. Base Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/turntable_ref.png`} 
          className="w-full h-full object-cover object-center opacity-70"
          alt="Studio"
        />
        {/* Darkening vignette to focus on the center */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-[#050608]/50 to-[#050608] opacity-90" 
             style={{ background: 'radial-gradient(circle at 50% 50%, transparent 30%, rgba(5,6,8,0.8) 70%, rgba(5,6,8,1) 100%)' }} />
      </div>

      {/* 2. Rotating Gold Ring (Masked Overlay) */}
      <motion.div 
        className="absolute inset-0 z-10 flex items-center justify-center origin-center"
        initial={{ rotate: 0 }}
        animate={{ rotate: [0, 85, -20, 10, 0] }}
        transition={{ 
          duration: 6, 
          delay: 2.0, 
          times: [0, 0.4, 0.7, 0.9, 1], 
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 2
        }}
      >
        <div 
          className="absolute inset-0"
          style={{ 
            backgroundImage: `url(${import.meta.env.BASE_URL}images/turntable_ref.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            // Isolate a ring. Tuning sizes based on typical midjourney circular composition.
            maskImage: 'radial-gradient(circle at 50% 50%, transparent 32cqw, black 34cqw, black 40cqw, transparent 42cqw)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 32cqw, black 34cqw, black 40cqw, transparent 42cqw)',
            filter: 'brightness(1.5) contrast(1.2)'
          }} 
        />
        {/* Add a subtle glow specifically to the rotating ring */}
        <div 
          className="absolute inset-0 border-[3px] border-[#d4af37]/30 rounded-full mix-blend-screen m-auto"
          style={{ 
            width: '78cqw', height: '78cqw', 
            boxShadow: '0 0 30px rgba(212,175,55,0.4), inset 0 0 20px rgba(212,175,55,0.2)' 
          }}
        />
      </motion.div>

      {/* 3. Central Orb Glow Pulse */}
      <motion.div 
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full z-15 mix-blend-screen pointer-events-none"
        style={{ width: '50cqw', height: '50cqw', background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)' }}
        animate={{ 
          scale: [1, 1.4, 1.1, 1.2, 1],
          opacity: [0.3, 0.8, 0.5, 0.6, 0.4] 
        }}
        transition={{ duration: 4, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      />

      {/* 4. Vertical Light Beam */}
      <motion.div 
        className="absolute left-1/2 bottom-[20%] w-[2px] bg-green-200 z-20 origin-bottom mix-blend-screen"
        style={{ boxShadow: '0 0 20px 4px rgba(74,222,128,0.8), 0 0 40px 10px rgba(139,92,246,0.4)' }}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: '70%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2.0, delay: 1.0, times: [0, 0.1, 0.8, 1], ease: "easeOut" }}
      />
      {/* Beam Impact Burst */}
      <motion.div
        className="absolute left-1/2 top-[30%] w-[12cqw] h-[12cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white mix-blend-screen z-25"
        style={{ boxShadow: '0 0 60px 20px rgba(74,222,128,0.9)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 2, 4], opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, delay: 1.3, ease: "easeOut" }}
      />

      {/* 5. Audio Waveform Reaction */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[20%] z-20 flex items-center justify-center gap-[1.5%] opacity-80 mix-blend-screen overflow-hidden">
        {[...Array(32)].map((_, i) => {
          const isCenter = Math.abs(i - 16) < 4;
          const delayOffset = Math.abs(i - 16) * 0.05;
          return (
            <motion.div
              key={i}
              className="w-[2%] bg-green-400 rounded-full"
              style={{ boxShadow: '0 0 10px rgba(74,222,128,0.8)' }}
              initial={{ height: '10%' }}
              animate={{ 
                height: ['10%', isCenter ? '90%' : '40%', '20%', '30%', '10%'] 
              }}
              transition={{ 
                duration: 2.5, 
                delay: 1.2 + delayOffset, 
                times: [0, 0.1, 0.3, 0.6, 1],
                repeat: Infinity,
                repeatDelay: 5.5
              }}
            />
          );
        })}
      </div>

      {/* 6. "GravelKing Pro" Holographic Wordmark */}
      <div className="absolute top-[22%] left-0 w-full flex justify-center z-30 pointer-events-none">
        <motion.div 
          className="relative whitespace-nowrap text-[6cqw] font-black tracking-[0.08em] text-transparent bg-clip-text"
          style={{ 
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            backgroundImage: 'linear-gradient(to right, #a78bfa, #4ade80, #fcd34d)',
            WebkitTextStroke: '2px rgba(255,255,255,0.2)'
          }}
        >
          {/* Base stroke text */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 2.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ textShadow: '0 0 40px rgba(167,139,250,0.6)' }}
          >
            GravelKing Pro
          </motion.div>
          
          {/* Overlay solid text that sweeps in */}
          <motion.div
            className="absolute inset-0 text-white"
            style={{ 
              textShadow: '0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(74,222,128,0.6)',
              clipPath: 'polygon(0 0, 0 0, 0 100%, 0% 100%)'
            }}
            animate={{ clipPath: ['polygon(0 0, 0 0, 0 100%, 0% 100%)', 'polygon(0 0, 100% 0, 100% 100%, 0% 100%)'] }}
            transition={{ duration: 1.5, delay: 2.8, ease: "easeInOut" }}
          >
            GravelKing Pro
          </motion.div>

          {/* Sweeping light edge */}
          <motion.div
            className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white to-transparent opacity-0 mix-blend-screen"
            animate={{ left: ['-100%', '100%'], opacity: [0, 0.8, 0] }}
            transition={{ duration: 1.5, delay: 2.8, ease: "easeInOut" }}
            style={{ transform: 'skewX(-20deg)' }}
          />
        </motion.div>
      </div>

    </motion.div>
  );
}
