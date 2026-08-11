import { motion } from "framer-motion";
const base = import.meta.env.BASE_URL;
export function Scene7() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, scale: .82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: .9, type: "spring", stiffness: 72 }}>
    <video className="footage absolute inset-0 h-full w-full object-cover" src={`${base}videos/mixing_console.mp4`} autoPlay muted loop playsInline />
    <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(14,31,28,.95),rgba(14,31,28,.72),rgba(255,93,71,.27))]" />
    <motion.div className="absolute -left-[12%] -top-[25%] h-[95%] w-[65%] rounded-full bg-[#f4c444]/17 blur-[8cqw]" animate={{ x: ["0%", "13%", "-3%", "0%"], y: ["0%", "3%", "-3%", "0%"] }} transition={{ duration: 9, ease: "easeInOut" }} />
    <div className="absolute inset-x-[8%] top-[15%] z-10 text-center">
      <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="micro-type text-[#f4c444]">GravelKing Pro / Lyrics Generator</motion.p>
      <motion.h2 initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .18, duration: .8, type: "spring" }} className="display-type mt-[4%] text-[9cqw] leading-[.78] text-[#f6f2e9]">WRITE IT.<br /><span className="text-[#ff5d47]">OWN IT.</span><br /><span className="text-[#f4c444]">BUILD IT.</span></motion.h2>
      <motion.div initial={{ width: 0 }} animate={{ width: "46%" }} transition={{ delay: .86, duration: .7 }} className="mx-auto mt-[4%] h-[.25cqw] bg-[#f4c444]" />
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-[3%] text-[1.2cqw] font-medium tracking-[.12em] text-[#f6f2e9]/82">gravelkingpro.io</motion.p>
    </div>
    <div className="absolute bottom-[5%] left-[8%] z-10 text-[.9cqw] uppercase tracking-[.16em] text-[#f6f2e9]/55">your workflow, with the lyric at the center</div>
  </motion.section>;
}