export default function Path30() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>BOOTSTRAPPED PATH · 30 DAYS</div>
      </div>
      <div className="absolute left-[5vw] top-[14vh] w-[88vw]">
        <p className="text-[1.6vw] font-bold uppercase tracking-[0.16em] text-[#5eead4]">Days 1–30 · $0 ad spend</p>
        <h2 className="mt-[1vh] font-display text-[4.2vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>First 10 paying subscribers, organic only</h2>
      </div>
      <div className="absolute left-[5vw] top-[33vh] grid w-[90vw] grid-cols-4 gap-[1.6vw]">
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Week 1</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Product Hunt launch. F6S profile live. DM 50 producers with a free "certify your beat, see the AI credit" offer.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Week 2</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Three "I certified my track" demo videos on TikTok + Shorts showing the human/AI split. Outreach to 10 indie labels.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Week 3</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>"Protect Your Music" live audio session. Collect 100 email signups from producer communities.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Week 4</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Convert the 10 most engaged signups to Studio. Open one B2B licensing conversation from label outreach.</p>
        </div>
      </div>
      <div className="absolute left-[5vw] top-[68vh] flex w-[90vw] items-stretch gap-[1.8vw]">
        <div className="flex-1 rounded-[0.8vw] border border-[#5eead4]/30 bg-[#5eead4]/8 p-[1.6vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Day-30 target</p>
          <p className="mt-[0.8vh] text-[2.2vw] font-extrabold">10 subscribers · 1 pilot license conversation</p>
        </div>
        <div className="flex-1 rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-white/60">Budget</p>
          <p className="mt-[0.8vh] text-[2.2vw] font-extrabold">$0 paid ads — product demos are the marketing</p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>The AI-credit certificate is the hook no other tool can demo</div>
        <div>07</div>
      </div>
    </div>
  );
}
