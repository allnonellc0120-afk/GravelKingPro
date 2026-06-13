import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// Per-stem channel: live meter + detented knob, mirroring the real Mix Studio.
// Voice sits at 0 dB, instruments at -2 dB (the promo reference mix).
const STEMS = [
  { name: 'Voice',  db: 0.0,  color: '#f59e0b', knob: 100 },
  { name: 'Drums',  db: -2.0, color: '#3b82f6', knob: 84 },
  { name: 'Bass',   db: -2.0, color: '#22c55e', knob: 84 },
  { name: 'Synth',  db: -2.0, color: '#ec4899', knob: 84 },
];

function Knob({ value, color }: { value: number; color: string }) {
  // value 0–150 → sweep -135°..+135°
  const angle = -135 + (value / 150) * 270;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="21" fill="#0b0f17" stroke={`${color}55`} strokeWidth="1.5" />
      {Array.from({ length: 11 }).map((_, i) => {
        const a = (-135 + (i / 10) * 270) * (Math.PI / 180);
        return (
          <line
            key={i}
            x1={24 + Math.cos(a) * 18} y1={24 + Math.sin(a) * 18}
            x2={24 + Math.cos(a) * 20} y2={24 + Math.sin(a) * 20}
            stroke={`${color}44`} strokeWidth="1"
          />
        );
      })}
      <line
        x1="24" y1="24"
        x2={24 + Math.cos(angle * Math.PI / 180) * 14}
        y2={24 + Math.sin(angle * Math.PI / 180) * 14}
        stroke={color} strokeWidth="3" strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="3" fill={color} />
    </svg>
  );
}

function StemChannel({ name, db, color, knob, delay, active }: {
  name: string; db: number; color: string; knob: number; delay: number; active: boolean;
}) {
  const [level, setLevel] = useState(0.2);

  useEffect(() => {
    if (!active) return;
    // Animate a believable RMS bounce that settles near the stem's level.
    const base = (db + 60) / 60; // 0..1
    const id = setInterval(() => {
      setLevel(Math.max(0.05, Math.min(1, base - 0.12 + Math.random() * 0.18)));
    }, 90);
    return () => clearInterval(id);
  }, [active, db]);

  return (
    <motion.div
      className="flex flex-col items-center gap-3 rounded-xl border bg-black/40 px-5 py-5 backdrop-blur-sm"
      style={{ borderColor: `${color}33` }}
      initial={{ opacity: 0, y: 40 }}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="text-[1.1vw] font-bold uppercase tracking-wider" style={{ color }}>{name}</span>

      {/* Live meter */}
      <div className="relative w-3 h-[9vw] rounded-full bg-black/60 border border-white/10 overflow-hidden">
        <motion.div
          className="absolute bottom-0 left-0 right-0 rounded-full"
          style={{ background: `linear-gradient(to top, ${color}, #eab308 88%)` }}
          animate={{ height: `${level * 100}%` }}
          transition={{ duration: 0.09, ease: 'linear' }}
        />
        {/* peak hold */}
        <div className="absolute left-0 right-0 h-0.5 bg-white/80" style={{ bottom: `${Math.min(98, level * 100 + 4)}%` }} />
      </div>

      <span className="text-[1vw] font-mono" style={{ color: db >= -0.1 ? '#f59e0b' : 'rgba(255,255,255,0.7)' }}>
        {db > 0 ? '+' : ''}{db.toFixed(1)} dB
      </span>

      {/* Detented knob */}
      <Knob value={knob} color={color} />
      <span className="text-[0.8vw] uppercase tracking-widest text-white/40">Gain</span>
    </motion.div>
  );
}

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 overflow-hidden px-[6vw]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        className="absolute -top-[15%] right-[10%] w-[40%] h-[40%] bg-amber-500/15 rounded-full blur-[120px]"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="relative z-10 text-center mb-[3vw]"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className="text-[4.5vw] font-black uppercase text-white leading-none drop-shadow-2xl">
          Live <span className="text-amber-500">Mix Studio</span>
        </h2>
        <p className="text-[1.5vw] text-white/70 mt-3 font-semibold">
          Per-stem metering · detented knobs · record live
        </p>
      </motion.div>

      <div className="relative z-10 flex gap-[2vw]">
        {STEMS.map((s, i) => (
          <StemChannel
            key={s.name}
            {...s}
            delay={i * 0.12}
            active={phase >= 1}
          />
        ))}
      </div>

      <motion.div
        className="relative z-10 mt-[3vw] inline-flex items-center gap-3 bg-amber-500 text-black px-8 py-3 rounded-full font-bold text-[1.5vw] uppercase tracking-widest shadow-[0_0_40px_rgba(245,158,11,0.4)]"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20 }}
      >
        Adjustable mastering + DAW · Studio plan
      </motion.div>
    </motion.div>
  );
}
