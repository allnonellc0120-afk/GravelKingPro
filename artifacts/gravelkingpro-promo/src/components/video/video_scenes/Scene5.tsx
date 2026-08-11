import { motion } from "framer-motion";

const base = import.meta.env.BASE_URL;

export function Scene5() {
  return (
    <motion.section className="absolute inset-0 overflow-hidden" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .7 }}>
      <video className="absolute inset-0 h-full w-full object-cover" src={`${base}videos/songwriter-mic.mp4`} autoPlay muted loop playsInline />
      <div className="absolute inset-0 bg-gradient-to-r from-[#17110d]/95 via-[#17110d]/65 to-[#17110d]/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#17110d]/90 via-transparent to-[#17110d]/20" />
      <div className="absolute left-[8vw] top-[18vh] z-10">
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }} className="mb-[1.2vh] text-[1vw] font-semibold uppercase tracking-[.2em] text-[#f0b34d]">From words to workflow</motion.p>
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .14, duration: .6 }} className="text-[4.6vw] font-bold leading-[.92] tracking-[-.06em]" style={{ fontFamily: "var(--font-heading)" }}>Keep the line.<br /><span className="text-[#f0b34d]">Build the song.</span></motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .7, duration: .5 }} className="mt-[2.4vh] max-w-[30vw] text-[1.35vw] leading-[1.28] text-[#f3dfc2]/88">Unlike generic AI music tools, GKP connects lyric generation to the rest of your music workflow — with your edits and documentation along for the ride.</motion.p>
      </div>
      <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .95, duration: .55 }} className="absolute bottom-[11vh] left-[8vw] z-10 flex items-center gap-[.8vw]">
        {["Lyrics", "Edit", "Document", "Build"].map((item, i) => <div key={item} className="flex items-center gap-[.8vw]"><span className={`rounded-full px-[1vw] py-[.7vh] text-[.8vw] font-semibold ${i === 3 ? "bg-[#f0b34d] text-[#21160f]" : "border border-[#f0b34d]/55 bg-[#21160f]/80 text-[#f5d9ae]"}`}>{item}</span>{i < 3 && <span className="text-[1vw] text-[#f0b34d]">→</span>}</div>)}
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.35, duration: .7, type: "spring" }} className="absolute bottom-[9vh] right-[8vw] z-10 w-[31vw] border-t border-[#f0b34d]/45 pt-[1.6vh]">
        <p className="text-[2.1vw] font-bold leading-[1.05] tracking-[-.035em] text-[#f7eddd]" style={{ fontFamily: "var(--font-heading)" }}>GravelKing Pro — Lyrics Generator</p>
        <p className="mt-[1vh] text-[1.15vw] font-medium tracking-[.05em] text-[#f0b34d]">Write it. Own it. Build it.</p>
      </motion.div>
    </motion.section>
  );
}