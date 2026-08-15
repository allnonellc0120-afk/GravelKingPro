export default function BusinessModel() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>BUSINESS MODEL</div>
      </div>
      <div className="absolute left-[5vw] top-[14vh] w-[88vw]">
        <h2 className="font-display text-[4.2vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Three revenue lines, one certified pipeline</h2>
      </div>
      <div className="absolute left-[5vw] top-[30vh] grid w-[90vw] grid-cols-3 gap-[1.8vw]">
        <div className="rounded-[0.8vw] border border-[#f59e0b]/35 bg-[#f59e0b]/8 p-[2vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">Subscription</p>
          <p className="mt-[1.5vh] font-display text-[3.6vw] font-bold leading-none">$9.99<span className="text-[2vw] font-semibold text-white/60">/mo</span></p>
          <p className="mt-[1.5vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Studio tier — mastering, Vocal Booth, DAW, vault, and a rolling certificate allowance.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[2vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Per-certificate</p>
          <p className="mt-[1.5vh] font-display text-[3.6vw] font-bold leading-none">$1.99<span className="text-[2vw] font-semibold text-white/60">/doc</span></p>
          <p className="mt-[1.5vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Pay-per-use certificate documents — no subscription required. Stamping stays free; the court-ready document is the product.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[2vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">B2B licensing</p>
          <p className="mt-[1.5vh] font-display text-[3.6vw] font-bold leading-none">$500+<span className="text-[2vw] font-semibold text-white/60">/mo</span></p>
          <p className="mt-[1.5vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>MLK v3.5 mastering and certification as a white-label API for labels, studios, and DAW platforms — $500–$5K/mo per seat.</p>
        </div>
      </div>
      <div className="absolute left-[5vw] top-[72vh] w-[90vw] rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
        <p className="text-[2vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-white">Already wired:</span> Stripe billing live in production, trial-integrity controls, referral program with commission only on verified paid invoices, export quotas, and Google Play Billing in the Android app.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>Target LTV:CAC 8:1 at scale · payback under 60 days at current pricing</div>
        <div>06</div>
      </div>
    </div>
  );
}
