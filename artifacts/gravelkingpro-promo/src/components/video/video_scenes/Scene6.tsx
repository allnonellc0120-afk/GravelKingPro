import { motion } from 'framer-motion';

export function Scene6() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      
      {/* Background */}
      <motion.div
        className="absolute inset-0 z-0 opacity-40 mix-blend-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/crypto_cert.jpg`}
          alt="Crypto Cert"
          className="w-full h-full object-cover"
        />
      </motion.div>

      <div className="relative z-10 w-full max-w-[70vw] px-[3vw] mx-auto flex flex-col items-center">
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="text-center mb-[6vh]"
        >
          <div className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase mb-[2vh]">Step 05 // IP Protection</div>
          <h2 className="text-[4vw] font-bold tracking-tight mb-[2vh]">Cryptographic Proof</h2>
          <p className="text-[#71717a] text-[1.2vw] font-light">Embedded directly into the audio file ID3 tags.</p>
        </motion.div>

        {/* Certificate Card */}
        <motion.div
          className="w-full bg-[#18181b]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-[3vw] relative overflow-hidden shadow-2xl"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          {/* Scanning line effect */}
          <motion.div
            className="absolute top-0 left-0 w-full h-[2px] bg-[#f59e0b] shadow-[0_0_20px_rgba(245,158,11,1)]"
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 3, ease: "linear", repeat: Infinity }}
          />
          
          <div className="grid grid-cols-2 gap-[2vw] mb-[4vh] border-b border-white/10 pb-[4vh]">
            <div>
              <div className="text-[0.8vw] text-[#71717a] font-mono uppercase tracking-widest mb-[1vh]">File Identity</div>
              <div className="text-[1.5vw] font-semibold text-white">master_final_v3.wav</div>
            </div>
            <div>
              <div className="text-[0.8vw] text-[#71717a] font-mono uppercase tracking-widest mb-[1vh]">Authorship Score</div>
              <div className="text-[1.5vw] font-semibold text-green-400">99.8% VERIFIED</div>
            </div>
          </div>

          <div className="space-y-[2vh] font-mono text-[1vw]">
            <div>
              <div className="text-[#71717a] mb-[1vh]">SHA-256 Content Hash</div>
              <motion.div 
                className="text-[#f59e0b] break-all bg-[#f59e0b]/5 p-[1vw] rounded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1 }}
              >
                e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
              </motion.div>
            </div>
            <div>
              <div className="text-[#71717a] mb-[1vh]">HMAC Fingerprint</div>
              <motion.div 
                className="text-white break-all bg-white/5 p-[1vw] rounded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.2 }}
              >
                a94a8fe5ccb19ba61c4c0873d391e987982fbbd3
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
