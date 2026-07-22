import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export function CharacterVideo({
  dialogue,
  subDialogue,
}: {
  dialogue?: string;
  subDialogue?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={`${import.meta.env.BASE_URL}videos/character.mp4`}
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none mix-blend-overlay opacity-30" />

      {/* Bottom text overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center justify-end pb-[8vh] px-[5vw] text-center">
        {dialogue && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5, type: 'spring' }}
            className="mb-[2vh] px-[3vw] py-[1.5vh] bg-white/95 text-black rounded-[2vw] shadow-2xl"
            style={{ fontFamily: "'Permanent Marker', cursive" }}
          >
            <span className="text-[2.5vw] leading-tight">{dialogue}</span>
          </motion.div>
        )}
        {subDialogue && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="text-[1.3vw] text-[#a1a1aa] font-mono uppercase tracking-wider max-w-[60vw]"
          >
            {subDialogue}
          </motion.p>
        )}
      </div>
    </div>
  );
}
