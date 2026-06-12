import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
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
      className="absolute inset-0 flex items-center justify-end bg-black overflow-hidden"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ duration: 0.8 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/studio_screens.mp4`}
        className="absolute left-0 w-[60%] h-full object-cover opacity-60"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-l from-black via-black/80 to-transparent" />
      
      <div className="relative z-10 pr-16 w-[60%] flex flex-col items-end text-right">
        <div className="flex flex-col gap-12">
          {[
            { title: "Audio Mastering", desc: "6 pro presets. One click to a polished master." },
            { title: "Beat Maker", desc: "GravelKing MLK v3 kernel. 7 genres." },
            { title: "Songwriter", desc: "Generate full structures in 8 genres." },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: 50 }}
              animate={phase >= i + 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-end gap-4 mb-2">
                <h3 className="text-[2.5vw] font-bold text-white shadow-black drop-shadow-md">{item.title}</h3>
                <div className="w-12 h-12 rounded bg-amber-500/20 flex items-center justify-center border border-amber-500/50">
                  <div className="w-4 h-4 rounded-full bg-amber-500" />
                </div>
              </div>
              <p className="text-[1.5vw] text-white/70 mr-16">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
