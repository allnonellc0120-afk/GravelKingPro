import { motion } from 'framer-motion';
import { ShieldCheck, Hash } from 'lucide-react';

export function WorkflowScene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ x: "100%", filter: "blur(20px)" }}
      animate={{ x: "0%", filter: "blur(0px)" }}
      exit={{ scale: 1.1, opacity: 0, filter: "blur(15px)" }}
      transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[#08090c] z-0" />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/crypto_cert.jpg`}
        className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-luminosity"
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        transition={{ duration: 8, ease: "easeOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090c]/80 via-transparent to-[#08090c] z-0" />

      <div className="z-20 w-full flex flex-col items-center justify-center px-[8vw]">
        {/* The Stamp */}
        <motion.div className="overflow-hidden mb-[6vh]">
          <motion.h1 
            className="text-[16vw] leading-none font-bold tracking-tighter text-amber-500 drop-shadow-[0_0_30px_rgba(245,158,11,0.4)]"
            initial={{ scale: 3, opacity: 0, y: "50%" }}
            animate={{ scale: 1, opacity: 1, y: "0%" }}
            transition={{ duration: 0.6, type: "spring", bounce: 0.4, delay: 0.2 }}
          >
            CERTIFY IT.
          </motion.h1>
        </motion.div>

        {/* Certificate Card UI */}
        <motion.div 
          className="w-[85vw] rounded-3xl border border-amber-500/30 bg-black/60 p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)] backdrop-blur-xl relative overflow-hidden"
          initial={{ y: 50, opacity: 0, rotateY: -30 }}
          animate={{ y: 0, opacity: 1, rotateY: 0 }}
          transition={{ duration: 0.8, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1200 }}
        >
          {/* Scanning Beam */}
          <motion.div
            className="absolute left-0 top-0 w-full h-1 bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,1)] z-30"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: [0, 300, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 2.5, delay: 1.5, ease: "linear" }}
          />

          <div className="flex items-center justify-between mb-8 border-b border-amber-500/20 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-amber-400" />
              <div className="text-[4.5vw] font-bold text-white tracking-wide">IP PROVENANCE</div>
            </div>
            <motion.div 
              className="px-3 py-1 bg-amber-500/20 rounded-full border border-amber-500/40 text-amber-300 text-[3vw] font-mono"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.5 }}
            >
              SECURED
            </motion.div>
          </div>

          <div className="space-y-4 font-mono">
            <div>
              <div className="text-white/40 text-[3vw] mb-1">ASSET HASH (SHA-256)</div>
              <motion.div 
                className="text-amber-200/80 text-[3.5vw] break-all leading-tight bg-black/40 p-3 rounded-lg border border-white/5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3 }}
              >
                0x8f4d9c...<motion.span 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4 }}
                >e2a1b9f7c4d5e6a7b8c9d0e1f2a3b4c5</motion.span>
              </motion.div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-white/40 text-[3vw] mb-1">TIMESTAMP</div>
                <motion.div className="text-white/90 text-[3.5vw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.5 }}>
                  {new Date().toISOString().split('T')[0]} 23:41:05 UTC
                </motion.div>
              </div>
              <div>
                <div className="text-white/40 text-[3vw] mb-1">OWNER</div>
                <motion.div className="text-white/90 text-[3.5vw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 5 }}>
                  CREATOR #8994
                </motion.div>
              </div>
            </div>
          </div>
          
          <motion.div
            className="mt-6 flex items-center justify-center gap-2 text-amber-400/80 text-[3.5vw]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 6.5 }}
          >
            <Hash className="w-4 h-4" />
            <span>UNLIMITED CERTIFICATES INCLUDED</span>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}