export default function Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>THE SOLUTION</div>
        </div>
        <h2 className="mt-[3vh] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>One platform: create, master, certify, verify</h2>
        <p className="mt-[1vh] text-[1.8vw] text-white/70">Live in production today at gravelkingpro.it.com.</p>
        <div className="mt-[3.5vh] grid grid-cols-4 gap-[1.4vw]">
          <div className="rounded-[0.8vw] border border-[#5eead4]/30 bg-[#5eead4]/8 p-[1.5vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 1</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.15]">IP Certification</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.35] text-white/75" style={{ textWrap: 'pretty' }}>Split-key certificates with AI attribution and catalog screening built in.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.5vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 2</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.15]">Mastering</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.35] text-white/75" style={{ textWrap: 'pretty' }}>Multi-band DSP mastering shaped for independent creators — balanced, streaming-ready sound in minutes.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.5vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 3</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.15]">Vocal Booth</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.35] text-white/75" style={{ textWrap: 'pretty' }}>Record in the browser with baked-in vocal effects and synced lyrics.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.5vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Pillar 4</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.15]">Karaoke DAW</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.35] text-white/75" style={{ textWrap: 'pretty' }}>A full browser DAW for writing, arranging, and performing — no install.</p>
          </div>
        </div>
        <div className="mt-[3vh] rounded-[0.8vw] border border-[#f59e0b]/35 bg-[#f59e0b]/10 p-[1.5vw]">
          <p className="text-[1.8vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#f59e0b]">What ties it together:</span> every track gets a provenance record — who made each part, which AI touched it, and whether it cleared the catalog screen.</p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>$9.99/mo Studio · $1.99 per certificate document · B2B licensing</div>
          <div>03</div>
        </div>
      </div>
    </div>
  );
}
