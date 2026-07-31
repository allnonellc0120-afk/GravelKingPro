export default function AskSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(52,211,153,0.07),transparent_55%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          09 · THE ASK
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-[6vw] top-[15vh]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1.05] tracking-tight">
          The Ask
        </h2>
        <p className="font-body mt-[1.8vh] text-[1.7vw] text-muted">Looking for:</p>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[33vh] grid grid-cols-2 gap-[1.6vw]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[2vw] py-[4vh]">
          <p className="font-display font-bold text-[2.2vw] text-primary/70">01</p>
          <p className="font-body mt-[1.6vh] text-[2vw] leading-[1.35] font-medium [text-wrap:pretty]">
            Strategic licensing partners
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[2vw] py-[4vh]">
          <p className="font-display font-bold text-[2.2vw] text-primary/70">02</p>
          <p className="font-body mt-[1.6vh] text-[2vw] leading-[1.35] font-medium [text-wrap:pretty]">
            Investors who understand creator tools + IP infrastructure
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[2vw] py-[4vh]">
          <p className="font-display font-bold text-[2.2vw] text-primary/70">03</p>
          <p className="font-body mt-[1.6vh] text-[2vw] leading-[1.35] font-medium [text-wrap:pretty]">
            Acquisition interest from audio platform companies
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[2vw] py-[4vh]">
          <p className="font-display font-bold text-[2.2vw] text-primary/70">04</p>
          <p className="font-body mt-[1.6vh] text-[2vw] leading-[1.35] font-medium [text-wrap:pretty]">
            Early adopter platforms and DAWs
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">MORRIS LAW KERNEL V3.5</p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">09 / 10</p>
      </div>
    </div>
  );
}
