import { motion } from 'framer-motion';

export function Scene8() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#050505]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    />
  );
}
