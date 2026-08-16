export default function BusinessModel() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>BUSINESS MODEL</div>
        </div>
        <h2 className="mt-[3vh] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Three revenue lines, one certified pipeline</h2>
        <div className="mt-[3.5vh] grid grid-cols-3 gap-[1.6vw]">
          <div className="rounded-[0.8vw] border border-[#f59e0b]/35 bg-[#f59e0b]/8 p-[1.8vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">Subscription</p>
            <p className="mt-[1.2vh] font-display text-[3.2vw] font-bold leading-none">$9.99<span className="text-[1.8vw] font-semibold text-white/60">/mo</span></p>
            <p className="mt-[1.2vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Studio tier — mastering, Vocal Booth, DAW, vault, and a rolling certificate allowance.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Per-certificate</p>
            <p className="mt-[1.2vh] font-display text-[3.2vw] font-bold leading-none">$1.99<span className="text-[1.8vw] font-semibold text-white/60">/doc</span></p>
            <p className="mt-[1.2vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Pay-per-use certificate documents — no subscription required. Stamping stays free; the court-ready document is the product.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">B2B licensing</p>
            <p className="mt-[1.2vh] font-display text-[3.2vw] font-bold leading-none">$500+<span className="text-[1.8vw] font-semibold text-white/60">/mo</span></p>
            <p className="mt-[1.2vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Mastering and certification as a white-label API for studios, labels, and platforms.</p>
          </div>
        </div>
        <div className="mt-[3vh] rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
          <p className="text-[1.8vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-white">Live on Android and the web:</span> Stripe billing, Google Play Billing, and a free certificate-stamping tier — the document is the paid product.</p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Certificate stamping is always free — the document is the paid product</div>
          <div>06</div>
        </div>
      </div>
    </div>
  );
}
