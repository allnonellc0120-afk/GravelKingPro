import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  { label: 'Upload Track', icon: '⬆', detail: 'Any format — WAV, MP3, FLAC, M4A' },
  { label: 'AI Split', icon: '✂', detail: 'Vocal + instrumental separated in seconds' },
  { label: 'Edit in DAW', icon: '🎚', detail: 'Every layer builds your authorship score' },
  { label: 'Get IP Certificate', icon: '🏛', detail: 'Hit 25% → locked, timestamped, yours' },
  { label: 'Drop on Any Platform', icon: '🌐', detail: 'Suno, Udio, DSPs — your proof travels with it' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const interval = setInterval(() => {
      setActive(i);
      i++;
      if (i >= steps.length) clearInterval(interval);
    }, 1400);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#06060a]"
      initial={{ opacity: 0, x: '100vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100vw' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#c9a22720 1px, transparent 1px), linear-gradient(90deg, #c9a22720 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-[3vh] px-[6vw] w-full">
        <motion.div className="overflow-hidden">
          <motion.h2
            className="text-[5vw] font-black uppercase leading-none tracking-tighter text-center"
            initial={{ y: '110%' }}
            animate={phase >= 1 ? { y: 0 } : { y: '110%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <span className="text-white">One workflow.</span>{' '}
            <span className="text-[#c9a227]">Total ownership.</span>
          </motion.h2>
        </motion.div>

        <div className="flex items-start justify-center gap-0 w-full mt-[2vh]">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center">
              <motion.div
                className="flex flex-col items-center gap-[1.5vh] w-[14vw]"
                initial={{ opacity: 0, y: 30 }}
                animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <motion.div
                  className="w-[5vw] h-[5vw] rounded-full flex items-center justify-center text-[2.2vw] border-2 transition-all"
                  animate={
                    active >= i
                      ? { borderColor: '#c9a227', backgroundColor: '#c9a22722', scale: 1.1 }
                      : { borderColor: '#ffffff20', backgroundColor: 'transparent', scale: 1 }
                  }
                  transition={{ duration: 0.4 }}
                >
                  {step.icon}
                </motion.div>
                <motion.div
                  className="font-black text-[1.4vw] uppercase tracking-wide text-center leading-tight"
                  animate={{ color: active >= i ? '#c9a227' : '#ffffff60' }}
                  transition={{ duration: 0.3 }}
                >
                  {step.label}
                </motion.div>
                <AnimatePresence>
                  {active >= i && (
                    <motion.p
                      className="text-[1.1vw] text-white/50 text-center leading-tight font-medium"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      {step.detail}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>

              {i < steps.length - 1 && (
                <motion.div
                  className="w-[3vw] h-[2px] mb-[5vh]"
                  animate={{ backgroundColor: active >= i ? '#c9a227' : '#ffffff15' }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
