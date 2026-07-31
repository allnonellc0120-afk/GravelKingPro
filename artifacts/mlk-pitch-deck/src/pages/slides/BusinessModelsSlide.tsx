export default function BusinessModelsSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.05),transparent_55%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          07 · BUSINESS MODELS
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-[6vw] top-[22vh] w-[28vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1.08] tracking-tight [text-wrap:balance]">
          Business Models
        </h2>
        <p className="font-body mt-[3vh] text-[1.6vw] leading-[1.5] text-muted [text-wrap:pretty]">
          Five ways the same engine earns — from per-seat licensing to a strategic exit.
        </p>
      </div>

      <div className="absolute right-[6vw] top-[19vh] w-[52vw]">
        <div className="flex items-center gap-[1.8vw] border-b border-white/10 py-[3.1vh]">
          <p className="font-display font-bold text-[2.4vw] text-primary/70 w-[4vw]">01</p>
          <p className="font-body text-[1.95vw] leading-[1.35] [text-wrap:pretty]">
            Licensing the engine to DAWs and platforms
          </p>
        </div>
        <div className="flex items-center gap-[1.8vw] border-b border-white/10 py-[3.1vh]">
          <p className="font-display font-bold text-[2.4vw] text-primary/70 w-[4vw]">02</p>
          <p className="font-body text-[1.95vw] leading-[1.35] [text-wrap:pretty]">
            White-label IP protection service
          </p>
        </div>
        <div className="flex items-center gap-[1.8vw] border-b border-white/10 py-[3.1vh]">
          <p className="font-display font-bold text-[2.4vw] text-primary/70 w-[4vw]">03</p>
          <p className="font-body text-[1.95vw] leading-[1.35] [text-wrap:pretty]">
            Premium features inside GravelKing Pro
          </p>
        </div>
        <div className="flex items-center gap-[1.8vw] border-b border-white/10 py-[3.1vh]">
          <p className="font-display font-bold text-[2.4vw] text-primary/70 w-[4vw]">04</p>
          <p className="font-body text-[1.95vw] leading-[1.35] [text-wrap:pretty]">
            API access for developers
          </p>
        </div>
        <div className="flex items-center gap-[1.8vw] py-[3.1vh]">
          <p className="font-display font-bold text-[2.4vw] text-accent/80 w-[4vw]">05</p>
          <p className="font-body text-[1.95vw] leading-[1.35] [text-wrap:pretty]">
            Potential acquisition by major audio/tech companies
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">MORRIS LAW KERNEL V3.5</p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">07 / 10</p>
      </div>
    </div>
  );
}
