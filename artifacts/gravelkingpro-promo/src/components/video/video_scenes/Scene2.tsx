import { motion } from "framer-motion";

const base = import.meta.env.BASE_URL;

export function Scene2() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ opacity: 0, x: "4%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: "-3%" }} transition={{ duration: .6 }}>
      <video className="absolute inset-0 h-full w-full object-cover" src={`${base}videos/songwriter-editing.mp4`} autoPlay muted loop playsInline />
      <div className="absolute inset-0 bg-[#21150f]/68" />
      <div className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-[#21150f]/90 to-transparent" />
      <div className="absolute left-[8vw] top-[25vh] z-10">
        <motion.p initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .35 }} className="mb-[1vh] text-[1vw] font-semibold uppercase tracking-[.22em] text-[#f0b34d]">Your story → a first draft</motion.p>
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .55 }} className="text-[4.5vw] font-bold leading-[.93] tracking-[-.055em]" style={{ fontFamily: "var(--font-heading)" }}>Give it<br /><span className="text-[#f0b34d]">something real.</span></motion.h2>
        <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .65, duration: .45 }} className="mt-[3vh] flex items-center gap-[.9vw]">
          <span className="grid h-[2.4vw] w-[2.4vw] place-items-center rounded-full bg-[#f0b34d] text-[1.1vw] font-bold text-[#21150f]">✦</span>
          <span className="text-[1.2vw] text-[#f7e9d3]">Lyrics Generator</span>
        </motion.div>
      </div>
      <div className="absolute bottom-[9vh] left-[48vw] z-10 w-[39vw] rounded-[1vw] border border-[#f1bd6a]/35 bg-[#241914]/82 p-[1.5vw] shadow-2xl backdrop-blur-md">
        <div className="mb-[1.4vh] flex items-center justify-between border-b border-[#f1bd6a]/20 pb-[1vh]">
          <span className="text-[.78vw] uppercase tracking-[.16em] text-[#f0b34d]">GKP / Lyrics Generator</span><span className="h-[.55vw] w-[.55vw] rounded-full bg-[#76b36a]" />
        </div>
        <p className="text-[1.18vw] leading-[1.25] text-[#f8ebd5]">Concrete plot, narrative details,<br /><span className="text-[#f0b34d]">or specific metaphors.</span></p>
        <div className="mt-[1.4vh] flex gap-[.6vw] text-[.72vw] text-[#f3d5ac]/70"><span className="rounded-full border border-[#f0b34d]/45 px-[.7vw] py-[.35vh]">Gritty Soul</span><span className="rounded-full border border-[#f0b34d]/45 px-[.7vw] py-[.35vh]">Rapid-Fire Verses</span></div>
      </div>
    </motion.section>
  );
}