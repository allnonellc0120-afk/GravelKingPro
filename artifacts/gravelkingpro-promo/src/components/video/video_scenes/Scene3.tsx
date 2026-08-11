import { motion } from "framer-motion";
import lyricsScreen from "@assets/IMG_1957_1786448818552.png";

export function Scene3() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden bg-[#21160f]" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.03 }} transition={{ duration: .65 }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_44%,rgba(240,179,77,.18),transparent_35%),linear-gradient(115deg,#21160f,#302015)]" />
      <div className="absolute left-[8vw] top-[19vh] z-10 w-[42vw]">
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }} className="mb-[1.3vh] text-[1vw] font-semibold uppercase tracking-[.2em] text-[#f0b34d]">Now make the first move</motion.p>
        <motion.h2 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18, duration: .6 }} className="text-[5vw] font-bold leading-[.9] tracking-[-.06em]" style={{ fontFamily: "var(--font-heading)" }}>Generate.<br /><span className="text-[#f0b34d]">Then listen.</span></motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .75, duration: .5 }} className="mt-[2.6vh] max-w-[30vw] text-[1.35vw] leading-[1.28] text-[#f4dfc4]/85">GKP turns your details into a usable draft — not a finished identity.</motion.p>
        <motion.div initial={{ width: 0 }} animate={{ width: "20vw" }} transition={{ delay: 1.1, duration: .6 }} className="mt-[3vh] h-[.18vw] bg-[#d9673d]" />
      </div>
      <motion.div initial={{ opacity: 0, x: 45, rotate: 4 }} animate={{ opacity: 1, x: 0, rotate: 2 }} transition={{ delay: .35, duration: .75, type: "spring", stiffness: 90 }} className="absolute right-[11vw] top-[8vh] z-10 h-[75vh] w-[25vw] overflow-hidden rounded-[2vw] border-[.35vw] border-[#4a392a] bg-[#0c0c0d] shadow-[0_2vw_4vw_rgba(0,0,0,.45)]">
        <img src={lyricsScreen} alt="" className="h-full w-full object-cover object-top" />
        <div className="pointer-events-none absolute inset-0 rounded-[1.6vw] ring-1 ring-inset ring-[#f0b34d]/30" />
      </motion.div>
      <div className="absolute bottom-[7vh] right-[8vw] z-20 rounded-full border border-[#f0b34d]/50 bg-[#261911]/90 px-[1vw] py-[.6vh] text-[.72vw] uppercase tracking-[.14em] text-[#f0b34d]">simple → advanced</div>
    </motion.section>
  );
}