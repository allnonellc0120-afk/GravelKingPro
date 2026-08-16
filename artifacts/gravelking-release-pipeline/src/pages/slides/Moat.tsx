export default function Moat() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>THE MOAT</div>
        </div>
        <h2 className="mt-[3vh] font-display text-[3.6vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>One workflow for a cleaner release</h2>
        <div className="mt-[3.5vh] grid grid-cols-2 gap-[1.4vw]">
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <div className="flex items-baseline gap-[0.9vw]">
              <span className="font-display text-[2.2vw] font-bold text-[#f59e0b]">1</span>
              <p className="text-[1.9vw] font-extrabold">Professional mastering</p>
            </div>
            <p className="mt-[0.8vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Bring a balanced, release-ready sound to every track with a guided mastering workflow built for independent creators.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <div className="flex items-baseline gap-[0.9vw]">
              <span className="font-display text-[2.2vw] font-bold text-[#f59e0b]">2</span>
              <p className="text-[1.9vw] font-extrabold">Verifiable certificates</p>
            </div>
            <p className="mt-[0.8vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Create a durable record for your release, with a verification link you can share with collaborators, platforms, and partners.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <div className="flex items-baseline gap-[0.9vw]">
              <span className="font-display text-[2.2vw] font-bold text-[#f59e0b]">3</span>
              <p className="text-[1.9vw] font-extrabold">Human + AI attribution</p>
            </div>
            <p className="mt-[0.8vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Keep the human contribution visible and disclose when AI helped create the instrumental, lyrics, or full track.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <div className="flex items-baseline gap-[0.9vw]">
              <span className="font-display text-[2.2vw] font-bold text-[#f59e0b]">4</span>
              <p className="text-[1.9vw] font-extrabold">Creator workflow</p>
            </div>
            <p className="mt-[0.8vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Write, record, master, and prepare a release in one place — from the first idea to the final shareable asset.</p>
          </div>
        </div>
        <div className="mt-[2.5vh] rounded-[0.8vw] border border-[#5eead4]/30 bg-[#5eead4]/8 p-[1.4vw]">
          <p className="text-[1.8vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#5eead4]">The result:</span> a release workflow that makes creator intent, AI involvement, and final audio easier to understand.</p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Make every release easier to trust</div>
          <div>05</div>
        </div>
      </div>
    </div>
  );
}
