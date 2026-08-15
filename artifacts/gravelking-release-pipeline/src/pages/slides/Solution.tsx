export default function Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>THE SOLUTION</div>
      </div>
      <div className="absolute left-[5vw] top-[15vh] w-[88vw]">
        <h2 className="font-display text-[4.2vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>One platform: create, master, certify, verify</h2>
        <p className="mt-[1.5vh] text-[2vw] text-white/70">Live in production today at gravelkingpro.it.com — built and shipped bootstrapped.</p>
      </div>
      <div className="absolute left-[5vw] top-[35vh] grid w-[90vw] grid-cols-4 gap-[1.6vw]">
        <div className="rounded-[0.8vw] border border-[#5eead4]/30 bg-[#5eead4]/8 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 1</p>
          <p className="mt-[1vh] text-[2.1vw] font-extrabold leading-[1.15]">IP Certification</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/75" style={{ textWrap: 'pretty' }}>Split-key certificates with AI attribution and catalog screening built in.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 2</p>
          <p className="mt-[1vh] text-[2.1vw] font-extrabold leading-[1.15]">Mastering</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/75" style={{ textWrap: 'pretty' }}>Morris Law Kernel v3.5 — proprietary multi-band DSP mastering in the cloud, minutes not weeks.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 3</p>
          <p className="mt-[1vh] text-[2.1vw] font-extrabold leading-[1.15]">Vocal Booth</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/75" style={{ textWrap: 'pretty' }}>Record in the browser with baked-in vocal effects and precise synced lyrics.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 4</p>
          <p className="mt-[1vh] text-[2.1vw] font-extrabold leading-[1.15]">Karaoke DAW</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/75" style={{ textWrap: 'pretty' }}>A full browser DAW for writing, arranging, and performing — no install.</p>
        </div>
      </div>
      <div className="absolute left-[5vw] top-[68vh] w-[90vw] rounded-[0.8vw] border border-[#f59e0b]/35 bg-[#f59e0b]/10 p-[1.6vw]">
        <p className="text-[2vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#f59e0b]">The connective tissue:</span> everything that moves through the platform gets a provenance record — who made each part, which AI touched it, and whether it cleared the catalog screen.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>$9.99/mo Studio · $1.99 per certificate document · B2B licensing</div>
        <div>03</div>
      </div>
    </div>
  );
}
