export default function ContactSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.08),transparent_60%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          10 · CONTACT
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-0 right-0 top-[24vh] flex flex-col items-center">
        <svg viewBox="0 0 640 70" className="w-[30vw] h-[5vh]" aria-hidden="true">
          <defs>
            <linearGradient id="contactWave" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <path
            d="M0 35 L60 35 L74 22 L88 48 L102 14 L116 56 L130 28 L148 42 L164 10 L180 60 L196 26 L212 44 L228 35 L280 35 L294 20 L308 50 L322 30 L336 40 L352 35 L420 35 L434 26 L448 44 L462 32 L476 38 L494 35 L580 35 L594 30 L608 40 L624 35 L640 35"
            fill="none"
            stroke="url(#contactWave)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h2 className="font-display font-bold text-[6vw] leading-[1.05] tracking-tight mt-[3vh]">
          Questions?
        </h2>
        <p className="font-body mt-[4.5vh] text-[2.3vw] font-semibold">Kevin Morris</p>
        <p className="font-body mt-[1vh] text-[1.7vw] text-muted">
          Founder, GravelKing Productions
        </p>
        <div className="mt-[4vh] flex items-center gap-[3vw]">
          <p className="font-body text-[1.7vw] text-primary">allnonellc0120@gmail.com</p>
          <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-white/25" />
          <p className="font-body text-[1.7vw] text-accent">@GravelKing84</p>
        </div>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">
          MORRIS LAW KERNEL V3.5 · JULY 2026
        </p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">10 / 10</p>
      </div>
    </div>
  );
}
