import { motion } from 'framer-motion';

export function Scene9() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-row-reverse"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-1/2 h-full bg-[#1c1c1f] relative flex items-center justify-center z-10 border-l border-white/10">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h3 className="text-[3vw] font-bold text-white uppercase tracking-widest mb-4">Official</h3>
          <h2 className="text-[5vw] font-black text-[var(--color-primary)] leading-none">GravelKing</h2>
          <h2 className="text-[5vw] font-black text-white leading-none">Apparel</h2>
        </motion.div>
      </div>
      <div className="w-1/2 h-full relative overflow-hidden">
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/merch_2.jpg`}
          className="w-full h-full object-cover"
          initial={{ scale: 1 }}
          animate={{ scale: 1.1 }}
          transition={{ duration: 6, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}