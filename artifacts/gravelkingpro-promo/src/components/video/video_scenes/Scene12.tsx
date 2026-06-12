import { motion } from 'framer-motion';

export function Scene12() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 opacity-20">
         <video 
          src={`${import.meta.env.BASE_URL}videos/waves-bg.mp4`} 
          className="w-full h-full object-cover"
          autoPlay muted playsInline
        />
      </div>

      <div className="relative z-10 text-center">
        <motion.h1 
          className="text-[6vw] font-black uppercase text-white mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          GravelKing Pro
        </motion.h1>
        
        <motion.div 
          className="bg-[var(--color-primary)] text-black font-bold text-[3vw] px-8 py-4 rounded-xl inline-block shadow-[0_0_40px_rgba(255,176,0,0.5)]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5, type: 'spring' }}
        >
          gravelkingpro.it.com
        </motion.div>

        <motion.p
          className="mt-8 text-white/50 text-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
        >
          Try it for free today.
        </motion.p>
      </div>
    </motion.div>
  );
}