import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Panel 1
      setTimeout(() => setPhase(2), 1500), // Panel 2
      setTimeout(() => setPhase(3), 2500), // Panel 3
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const panels = [
    {
      id: 1,
      title: "Vocal Booth",
      icon: "🎤",
      desc: "Record over any track",
      bg: "radial-gradient(circle at top left, rgba(201,162,39,0.15), transparent)"
    },
    {
      id: 2,
      title: "IP Certificate",
      icon: "🛡️",
      desc: "Certify your authorship\nScore: 82%",
      bg: "radial-gradient(circle at top center, rgba(16,185,129,0.15), transparent)",
      active: true
    },
    {
      id: 3,
      title: "DAW",
      icon: "🎚️",
      desc: "Professional mastering presets",
      bg: "radial-gradient(circle at top right, rgba(201,162,39,0.15), transparent)"
    }
  ];

  return (
    <motion.div className="absolute inset-0 bg-[#080808] flex items-center justify-center p-[5vw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      
      <div className="w-full flex justify-between gap-[3vw] h-[60vh]">
        {panels.map((panel, i) => (
          <motion.div
            key={panel.id}
            className="flex-1 rounded-2xl border flex flex-col items-center justify-center text-center p-[2vw] relative overflow-hidden"
            style={{
              borderColor: panel.active ? '#c9a227' : 'rgba(255,255,255,0.1)',
              background: '#0a0a0a',
            }}
            initial={{ opacity: 0, y: 100 }}
            animate={phase >= i + 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 100 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: panel.bg }} />
            
            <div className="text-[4vw] mb-[2vh] z-10">{panel.icon}</div>
            <div className="text-[2vw] font-bold text-white z-10">{panel.title}</div>
            <div className="text-[1.2vw] text-white/60 mt-[1vh] z-10 whitespace-pre-line">{panel.desc}</div>
            
            {panel.active && (
              <motion.div 
                className="absolute inset-0 border-2 border-[#c9a227] rounded-2xl"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>
        ))}
      </div>

    </motion.div>
  );
}
