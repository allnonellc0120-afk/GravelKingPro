import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SHARD_COUNT = 9;

const shards = Array.from({ length: SHARD_COUNT }, (_, i) => ({
  id: i,
  x: (Math.random() - 0.5) * 420,
  y: (Math.random() - 0.5) * 340 + 80,
  rotate: (Math.random() - 0.5) * 720,
  scale: 0.3 + Math.random() * 0.7,
  delay: i * 0.04,
  width: 18 + Math.floor(Math.random() * 28),
  height: 8 + Math.floor(Math.random() * 14),
  color: i % 3 === 0 ? '#b0bec5' : i % 3 === 1 ? '#78909c' : '#cfd8dc',
}));

export function Scene8() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 4400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.7 }}
    >
      {/* Dark stone texture radial gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, #1a1200 0%, #0a0800 60%, #000 100%)',
        }}
      />

      {/* Ambient amber glow — ignites on impact */}
      <motion.div
        className="absolute rounded-full blur-[120px] pointer-events-none"
        style={{ width: '60vw', height: '40vh', background: '#f59e0b' }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={
          phase >= 2
            ? { opacity: [0, 0.55, 0.35, 0.4], scale: [0.5, 1.4, 1, 1.1] }
            : { opacity: 0, scale: 0.5 }
        }
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      {/* ── GK TRADEMARK ── */}
      <div className="relative z-20 flex flex-col items-center">
        <motion.div
          className="relative select-none"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* GK text */}
          <motion.span
            className="block text-[22vw] font-black leading-none tracking-tighter"
            style={{
              fontStyle: 'italic',
              textShadow:
                phase >= 2
                  ? '0 0 80px #f59e0b, 0 0 200px #f59e0b88'
                  : '0 4px 40px #00000088',
              color: '#f59e0b',
              WebkitTextStroke: phase >= 2 ? '2px #fbbf24' : '1px #b45309',
            }}
          >
            GK
          </motion.span>

          {/* ™ mark */}
          <motion.span
            className="absolute top-4 right-0 text-[3vw] font-bold text-amber-400/70"
            style={{ transform: 'translate(80%, -30%)' }}
          >
            ™
          </motion.span>

          {/* Crack lines — appear on impact */}
          <AnimatePresence>
            {phase >= 2 && (
              <motion.svg
                key="cracks"
                className="absolute inset-0 w-full h-full pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.6] }}
                transition={{ duration: 0.4 }}
                viewBox="0 0 200 120"
                preserveAspectRatio="none"
              >
                <path d="M100,0 L90,40 L110,50 L85,120" stroke="#fbbf24" strokeWidth="1.5" fill="none" opacity="0.5" />
                <path d="M120,20 L105,55 L125,60 L115,100" stroke="#fbbf24" strokeWidth="1" fill="none" opacity="0.4" />
                <path d="M80,10 L95,45 L75,55 L88,95" stroke="#fbbf24" strokeWidth="0.8" fill="none" opacity="0.35" />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Tagline */}
        <AnimatePresence>
          {phase >= 3 && (
            <motion.p
              key="tagline"
              className="text-[2.4vw] font-black uppercase tracking-[0.25em] text-white mt-6"
              initial={{ opacity: 0, y: 20, letterSpacing: '0.05em' }}
              animate={{ opacity: 1, y: 0, letterSpacing: '0.25em' }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              GK is harder than{' '}
              <span className="text-amber-500">the hammer.</span>
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 4 && (
            <motion.p
              key="sub"
              className="text-[1.3vw] text-white/50 mt-3 tracking-widest uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              Morris Law V3 · Engineered to outlast the force
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── HAMMER ── */}
      <motion.div
        className="absolute z-30 pointer-events-none"
        style={{ top: '-10%', left: '50%', transformOrigin: 'top center' }}
        initial={{ x: '-50%', y: 0, rotate: -15 }}
        animate={
          phase === 0
            ? { x: '-50%', y: 0, rotate: -15 }
            : phase === 1
            ? { x: '-50%', y: '38vh', rotate: -15 }
            : { x: '-50%', y: '38vh', rotate: -15, opacity: 0 }
        }
        transition={
          phase === 1
            ? { duration: 0.55, ease: [0.8, 0, 0.9, 1] }
            : phase === 2
            ? { duration: 0.18, ease: 'easeIn' }
            : { duration: 0 }
        }
      >
        {/* Hammer SVG */}
        <svg width="72" height="220" viewBox="0 0 72 220" fill="none">
          {/* Handle */}
          <rect x="30" y="60" width="12" height="160" rx="4" fill="#8B6914" />
          {/* Head */}
          <rect x="4" y="0" width="64" height="64" rx="8" fill="#607D8B" />
          <rect x="10" y="6" width="52" height="52" rx="6" fill="#78909C" />
          <rect x="16" y="12" width="40" height="40" rx="4" fill="#90A4AE" />
        </svg>
      </motion.div>

      {/* ── HAMMER SHARDS (fly on impact) ── */}
      <AnimatePresence>
        {phase >= 2 &&
          shards.map((s) => (
            <motion.div
              key={s.id}
              className="absolute z-40 rounded pointer-events-none"
              style={{
                width: s.width,
                height: s.height,
                background: s.color,
                top: '48%',
                left: '50%',
              }}
              initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 0, rotate: 0 }}
              animate={{
                x: `calc(-50% + ${s.x}px)`,
                y: `calc(-50% + ${s.y}px)`,
                opacity: [1, 1, 0],
                scale: [0, s.scale, s.scale * 0.6],
                rotate: s.rotate,
              }}
              transition={{
                duration: 1.4,
                ease: 'easeOut',
                delay: s.delay,
                opacity: { times: [0, 0.5, 1], duration: 1.4 },
              }}
            />
          ))}
      </AnimatePresence>

      {/* Impact flash */}
      <AnimatePresence>
        {phase === 2 && (
          <motion.div
            key="flash"
            className="absolute inset-0 z-50 pointer-events-none bg-white"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
