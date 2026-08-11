import { motion } from "framer-motion";

const base = import.meta.env.BASE_URL;

export function Scene1() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.55 }}>
      <video className="absolute inset-0 h-full w-full object-cover" src={`${base}videos/songwriter-desk.mp4`} autoPlay muted loop playsInline />
      <div className="absolute inset-0 bg-gradient-to-r from-[#1b120d]/95 via-[#1b120d]/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#1b120d]/80 via-transparent to-[#1b120d]/20" />
      <div className="absolute left-[8vw] top-[21vh] z-10 max-w-[46vw]">
        <motion.div initial={{ width: 0 }} animate={{ width: "4.2vw" }} transition={{ duration: 0.45 }} className="mb-[2.2vh] h-[0.28vw] bg-[#f0b34d]" />
        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25, duration: .4 }} className="mb-[1.5vh] text-[1.15vw] font-semibold uppercase tracking-[0.22em] text-[#f0b34d]">A real story starts here</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .38, duration: .65 }} className="text-[5.2vw] font-bold leading-[.9] tracking-[-.06em] text-[#f6eddf]" style={{ fontFamily: "var(--font-heading)" }}>
          Don’t ask<br />AI to <em className="text-[#f0b34d]">be you.</em>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .9, duration: .5 }} className="mt-[2.6vh] max-w-[27vw] text-[1.35vw] leading-[1.3] text-[#f3dfc2]/85">Start with the night, the person, the line you actually remember.</motion.p>
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .9, duration: .5 }} className="absolute bottom-[9vh] right-[7vw] z-10 w-[22vw] border-l-2 border-[#f0b34d] pl-[1.2vw]">
        <p className="text-[1.25vw] italic leading-[1.2] text-[#f6eddf]">“The bus was late. She stayed anyway.”</p>
        <p className="mt-[.9vh] text-[.7vw] uppercase tracking-[.18em] text-[#efcda4]/65">the raw note</p>
      </motion.div>
    </motion.section>
  );
}