import { motion } from "framer-motion";
import lyricsEditor from "@assets/IMG_1956_1786448818552.png";

export function Scene4() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ opacity: 0, y: "3%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "-3%" }} transition={{ duration: .55 }}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#281b13,#171313)]" />
      <div className="absolute inset-y-0 right-0 w-[48%] bg-[radial-gradient(circle_at_70%_45%,rgba(214,100,61,.27),transparent_50%)]" />
      <div className="absolute left-[8vw] top-[18vh] z-10 w-[41vw]">
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }} className="mb-[1.2vh] text-[1vw] font-semibold uppercase tracking-[.2em] text-[#d9673d]">The human part matters</motion.p>
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15, duration: .55 }} className="text-[4.65vw] font-bold leading-[.93] tracking-[-.06em]" style={{ fontFamily: "var(--font-heading)" }}>Edit every<br /><span className="text-[#f0b34d]">line.</span> Own the<br />point of view.</motion.h2>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .7, duration: .5 }} className="mt-[3.4vh] flex flex-col gap-[1.05vh] text-[1.15vw] text-[#f4dfc4]">
          <div className="flex items-center gap-[.7vw]"><span className="h-[.55vw] w-[.55vw] rounded-full bg-[#f0b34d]" />line-by-line human editing</div>
          <div className="flex items-center gap-[.7vw]"><span className="h-[.55vw] w-[.55vw] rounded-full bg-[#f0b34d]" />authorship + IP documentation</div>
          <div className="flex items-center gap-[.7vw]"><span className="h-[.55vw] w-[.55vw] rounded-full bg-[#f0b34d]" />a draft you can actually build on</div>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, x: 60, rotate: 5 }} animate={{ opacity: 1, x: 0, rotate: -2 }} transition={{ delay: .25, duration: .7, type: "spring", stiffness: 85 }} className="absolute right-[9vw] top-[12vh] h-[72vh] w-[24vw] overflow-hidden rounded-[2vw] border-[.35vw] border-[#4c382a] shadow-[0_2vw_4vw_rgba(0,0,0,.5)]">
        <img src={lyricsEditor} alt="" className="h-full w-full object-cover object-top" />
        <motion.div initial={{ x: "-100%" }} animate={{ x: "130%" }} transition={{ delay: 1.2, duration: 1.1, repeat: Infinity, repeatDelay: 2.5 }} className="absolute left-0 top-[52%] h-[.22vw] w-[55%] bg-[#f0b34d] shadow-[0_0_1.2vw_rgba(240,179,77,.8)]" />
      </motion.div>
      <div className="absolute bottom-[7vh] right-[8vw] rounded-[.7vw] bg-[#f0b34d] px-[1vw] py-[.65vh] text-[.72vw] font-bold uppercase tracking-[.12em] text-[#281b13]">you keep the pen</div>
    </motion.section>
  );
}