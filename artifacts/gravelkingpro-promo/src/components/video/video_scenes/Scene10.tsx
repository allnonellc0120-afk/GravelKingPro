import { motion } from 'framer-motion';

export function Scene10() {
  return (
    <motion.div 
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/merch_3.jpg`}
        className="w-full h-full object-cover opacity-50"
        initial={{ y: "10%" }}
        animate={{ y: "-10%" }}
        transition={{ duration: 8, ease: "linear" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.h2 
          className="text-[8vw] font-black uppercase text-white tracking-tighter mix-blend-overlay"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, type: "spring" }}
        >
          Streetwear Vibe.
        </motion.h2>
      </div>
    </motion.div>
  );
}