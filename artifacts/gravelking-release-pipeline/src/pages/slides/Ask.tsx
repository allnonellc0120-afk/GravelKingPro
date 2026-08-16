const base = import.meta.env.BASE_URL;

export default function Ask() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <img src={`${base}studio-hero.jpg`} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover opacity-35" alt="Recording studio" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#07111f] via-[#07111f]/85 to-[#07111f]/60" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between border-b border-white/20 pb-[2vh] text-[1.5vw] text-white/60">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/85"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING PRODUCTIONS</div>
        <div>GET STARTED</div>
      </div>
      <div className="absolute left-[5vw] top-[20vh] w-[60vw]">
        <h2 className="font-display text-[5.2vw] font-bold leading-[1.0] tracking-[-0.03em]" style={{ textWrap: 'balance' }}>Your next release deserves a clear record</h2>
      </div>
      <div className="absolute left-[5vw] top-[52vh] grid w-[90vw] grid-cols-4 gap-[1.6vw]">
        <div className="rounded-[0.8vw] border border-white/15 bg-[#07111f]/70 p-[1.6vw]">
            <p className="font-display text-[2.8vw] font-bold text-[#f59e0b]">01</p>
            <p className="mt-[0.6vh] text-[1.9vw] leading-[1.35] text-white/80">Create — write, record, and arrange in the browser</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/15 bg-[#07111f]/70 p-[1.6vw]">
            <p className="font-display text-[2.8vw] font-bold text-[#f59e0b]">02</p>
            <p className="mt-[0.6vh] text-[1.9vw] leading-[1.35] text-white/80">Master — shape a polished, release-ready sound</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/15 bg-[#07111f]/70 p-[1.6vw]">
            <p className="font-display text-[2.8vw] font-bold text-[#f59e0b]">03</p>
            <p className="mt-[0.6vh] text-[1.9vw] leading-[1.35] text-white/80">Attribute — show the human work and AI involvement</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/15 bg-[#07111f]/70 p-[1.6vw]">
            <p className="font-display text-[2.8vw] font-bold text-[#f59e0b]">04</p>
            <p className="mt-[0.6vh] text-[1.9vw] leading-[1.35] text-white/80">Share — send a verification link with your release</p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-end justify-between border-t border-white/20 pt-[2vh] text-[1.6vw]">
        <div className="text-white/80">Try GravelKing Pro at gravelkingpro.it.com</div>
        <div className="font-bold text-[#5eead4]">gravelkingpro.it.com</div>
      </div>
    </div>
  );
}
