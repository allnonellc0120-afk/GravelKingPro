import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export function CharacterVideo({ 
  className, 
  style, 
  dialogue, 
  speaker = 'beavis' 
}: { 
  className?: string; 
  style?: React.CSSProperties;
  dialogue?: string;
  speaker?: 'beavis' | 'butthead';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <motion.div 
      className={`relative overflow-visible flex flex-col items-center ${className}`}
      style={style}
    >
      {dialogue && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, type: 'spring' }}
          className="absolute -top-[5vw] z-50 px-[1vw] py-[0.5vw] bg-black/80 border-2 border-[#00FFE5] rounded-xl text-[#00FFE5] text-[1vw] font-mono whitespace-nowrap"
          style={{ 
            left: speaker === 'beavis' ? '-2vw' : 'auto',
            right: speaker === 'butthead' ? '-2vw' : 'auto',
          }}
        >
          {dialogue}
          {/* Bubble tail */}
          <div 
            className="absolute -bottom-[0.5vw] w-[1vw] h-[1vw] bg-black border-r-2 border-b-2 border-[#00FFE5] rotate-45"
            style={{ 
              left: speaker === 'beavis' ? '2vw' : 'auto',
              right: speaker === 'butthead' ? '2vw' : 'auto',
            }}
          />
        </motion.div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-[#00FFE5]/30 shadow-[0_0_20px_rgba(0,255,229,0.2)] w-full h-full aspect-video z-10">
        <video
          ref={videoRef}
          src={`${import.meta.env.BASE_URL}videos/beavis-butthead.mp4`}
          loop
          muted
          playsInline
          className="w-full h-full object-cover grayscale-[0.2] contrast-[1.2]"
        />
        {/* Cyberpunk scanlines overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none mix-blend-overlay" />
        <div className="absolute inset-0 bg-[#00FFE5]/10 mix-blend-screen pointer-events-none" />
      </div>
    </motion.div>
  );
}
