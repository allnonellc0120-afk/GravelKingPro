import { motion } from 'framer-motion';

export function Scene3() {
  const differentiators = [
    { title: "Kernel-Level DSP", desc: "Morris Law Kernel V3.5 bypasses generic audio chains for raw compute performance.", icon: "⚡" },
    { title: "Cryptographic IP Cert", desc: "Your ownership baked directly into the master file, mathematically provable.", icon: "🔐" },
    { title: "Sub-35ms Verify", desc: "Watermark verification at kernel speeds. No cloud roundtrips needed.", icon: "⏱️" }
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: "-100vh" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background tech grid */}
      <div className="absolute inset-0 grid grid-cols-12 grid-rows-6 opacity-[0.03] pointer-events-none">
        {Array.from({ length: 72 }).map((_, i) => (
          <div key={i} className="border-[0.5px] border-white/20" />
        ))}
      </div>

      <div className="w-[85vw] mx-auto flex flex-col justify-center h-full relative z-20">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="mb-[6vh]"
        >
          <span className="font-mono text-[1vw] text-[#ff3a1a] uppercase tracking-widest block mb-[1vh]">
            What Competitors Lack
          </span>
          <h2 className="font-heading font-bold text-[4.5vw] leading-none text-white tracking-tight">
            NOT JUST <span className="italic font-light text-[#71717a]">SPEED.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-3 gap-[3vw]">
          {differentiators.map((diff, i) => (
            <motion.div
              key={diff.title}
              className="relative p-[2vw] border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden group"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.0 + (i * 0.2), type: "spring", stiffness: 100 }}
            >
              {/* Card corner accent */}
              <div className="absolute top-0 right-0 w-[2vw] h-[2vw] border-t-2 border-r-2 border-[#ff3a1a] opacity-50" />
              
              {/* Scanline hover effect simulation */}
              <motion.div 
                className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#ff3a1a]"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: 1.4 + (i * 0.2) }}
              />

              <div className="text-[2vw] mb-[2vh] opacity-80 filter grayscale">
                {diff.icon}
              </div>
              
              <h3 className="font-heading font-bold text-[1.5vw] text-white mb-[1vh] leading-tight">
                {diff.title}
              </h3>
              
              <p className="font-body text-[1vw] text-[#a1a1aa] leading-relaxed">
                {diff.desc}
              </p>
              
              <motion.div 
                className="absolute -bottom-10 -right-10 font-mono text-[8vw] font-black text-white/[0.03] select-none"
                initial={{ opacity: 0, rotate: 15 }}
                animate={{ opacity: 1, rotate: 0 }}
                transition={{ duration: 1, delay: 1.5 + (i * 0.2) }}
              >
                0{i+1}
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Verification pulse effect */}
        <motion.div
          className="absolute right-[5vw] top-[20vh] flex flex-col items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 2.5 }}
        >
          <div className="flex items-center gap-[1vw]">
            <span className="font-mono text-[0.8vw] text-white/40 uppercase tracking-widest">
              Live Verification
            </span>
            <motion.div 
              className="w-[8px] h-[8px] rounded-full bg-[#ff3a1a]"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <motion.div 
            className="font-mono text-[2.5vw] font-bold text-[#ff3a1a]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1, delay: 2.8 }}
          >
            &lt;35ms
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
