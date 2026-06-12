import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/keyboard_play.mp4`}
        className="absolute right-0 w-[60%] h-full object-cover opacity-70"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
      
      <div className="relative z-10 pl-16 w-[60%]">
        <motion.h2
          className="text-[5vw] font-black uppercase text-white leading-tight shadow-black drop-shadow-2xl"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          All-in-one <br />
          <span className="text-amber-500">Production Suite</span>
        </motion.h2>

        <div className="mt-12 flex flex-col gap-8">
          {[
            { title: "Voice Removal", desc: "Strip vocals instantly. Get clean instrumentals." },
            { title: "Stem Splitting", desc: "Separate bass, mid, highs, and instruments." },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= i + 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded bg-amber-500/20 flex items-center justify-center border border-amber-500/50">
                  <div className="w-4 h-4 rounded-full bg-amber-500" />
                </div>
                <h3 className="text-[2.5vw] font-bold text-white shadow-black drop-shadow-md">{item.title}</h3>
              </div>
              <p className="text-[1.5vw] text-white/70 ml-16">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
