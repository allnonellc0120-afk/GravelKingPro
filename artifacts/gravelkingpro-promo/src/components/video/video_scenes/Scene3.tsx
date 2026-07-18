import { motion } from 'framer-motion';

export function Scene3() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 0.3, scale: 1 }}
        exit={{ opacity: 0, filter: "blur(20px)" }}
        transition={{ duration: 2, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/daw_abstract.jpg`}
          alt="DAW Abstract"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#09090b]/80"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[85vw] px-[4vw] mx-auto grid grid-cols-2 gap-[4vw] items-center">
        
        {/* Visual Column - Meters */}
        <motion.div
          className="flex flex-col gap-[2vh]"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          {[
            { label: 'Club', val: '-12 LUFS', w: '85%' },
            { label: 'YouTube', val: '-14 LUFS', w: '75%' },
            { label: 'Apple', val: '-16 LUFS', w: '65%' },
            { label: 'SoundCloud', val: '-11 LUFS', w: '92%' },
          ].map((preset, i) => (
            <motion.div 
              key={preset.label}
              className="bg-black/50 border border-white/5 rounded-xl p-[2vh] backdrop-blur-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 + (i * 0.15) }}
            >
              <div className="flex justify-between text-[1vw] mb-[1vh] font-mono">
                <span className="text-white">{preset.label}</span>
                <span className="text-[#f59e0b]">{preset.val}</span>
              </div>
              <div className="h-[1vh] w-full bg-white/10 rounded-full overflow-hidden flex">
                <motion.div 
                  className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                  initial={{ width: '0%' }}
                  animate={{ width: preset.w }}
                  transition={{ duration: 1.5, delay: 1 + (i * 0.1), type: "spring" }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Text Column */}
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20, filter: "blur(10px)" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          >
            <div className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase mb-[2vh]">Step 02 // Mastering Tool</div>
            <h2 className="text-[4vw] font-bold tracking-tight mb-[3vh] leading-tight">
              Broadcast<br />Ready. Instantly.
            </h2>
            <p className="text-[#71717a] text-[1.2vw] max-w-[30vw] font-light mb-[4vh]">
              Local MLK v3.5 kernel processing. No cloud uploads. 11 broadcast presets to hit exact LUFS targets in under 2 minutes.
            </p>
            
            <div className="inline-flex items-center gap-[1vw] px-[1.5vw] py-[1.5vh] rounded-lg border border-[#f59e0b]/50 bg-[#f59e0b]/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#f59e0b] w-[1.5vw] h-[1.5vw]">
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-semibold text-white text-[1.1vw]">44.1kHz Studio Quality</span>
            </div>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}
