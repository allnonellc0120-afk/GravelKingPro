import { motion } from 'framer-motion';

export function Scene7() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      
      {/* Background layer */}
      <motion.div
        className="absolute left-0 top-0 w-1/2 h-full z-0 opacity-30"
        initial={{ x: '-20%', opacity: 0 }}
        animate={{ x: '0%', opacity: 0.3 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[85vw] px-[4vw] mx-auto grid grid-cols-2 gap-[4vw] items-center">
        
        {/* Release UI Mockup */}
        <motion.div
          className="relative rounded-2xl overflow-hidden shadow-2xl glass-panel border border-white/10"
          initial={{ opacity: 0, scale: 0.9, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 50 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/gold_record.jpg`}
            alt="Gold Record"
            className="w-full h-[35vh] object-cover opacity-80"
          />
          <div className="p-[2vw] bg-black/90 backdrop-blur-xl border-t border-white/5">
            <h3 className="text-[2vw] font-bold text-white mb-[1vh]">Neon Bleeding</h3>
            <p className="text-[#71717a] font-mono text-[1vw] mb-[3vh]">Released via GravelKing Label</p>
            
            <div className="flex gap-[1vw]">
              <motion.div 
                className="flex-1 bg-[#f59e0b] text-black font-semibold text-[1vw] text-center py-[1.5vh] rounded-lg flex items-center justify-center gap-[0.5vw] cursor-pointer"
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[1.2vw] h-[1.2vw]">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Publish Release
              </motion.div>
              <div className="flex-1 bg-white/10 text-white font-semibold text-[1vw] text-center py-[1.5vh] rounded-lg border border-white/10">
                View Storefront
              </div>
            </div>
          </div>
        </motion.div>

        {/* Text Column */}
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          >
            <div className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase mb-[2vh]">Step 06 // Label Page</div>
            <h2 className="text-[4vw] font-bold tracking-tight mb-[3vh] leading-tight">
              Artist Storefront<br />& Release.
            </h2>
            <p className="text-[#71717a] text-[1.2vw] max-w-[30vw] font-light mb-[4vh]">
              Push your certified master directly to your storefront. 5 minutes from final mix to live release.
            </p>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}
