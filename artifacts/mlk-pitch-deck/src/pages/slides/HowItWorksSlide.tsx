export default function HowItWorksSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.05),transparent_60%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          04 · HOW IT WORKS
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-[6vw] top-[16vh]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1.05] tracking-tight">
          How It Works
        </h2>
        <p className="font-body mt-[1.8vh] text-[1.6vw] text-muted">
          The signal chain, from raw audio to signed legal report.
        </p>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[42vh] h-[0.2vh] bg-gradient-to-r from-primary via-primary to-accent opacity-40" />

      <div className="absolute left-[6vw] right-[6vw] top-[36vh] flex gap-[1.2vw]">
        <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.1vw] pt-[2vh] pb-[2.4vh]">
          <div className="w-[2.6vw] h-[2.6vw] rounded-full bg-primary/15 border border-primary/50 flex items-center justify-center">
            <p className="font-display font-bold text-[1.15vw] text-primary">1</p>
          </div>
          <p className="font-body mt-[2vh] text-[1.15vw] font-semibold tracking-[0.12em] text-primary">
            INPUT
          </p>
          <p className="font-body mt-[1vh] text-[1.6vw] leading-[1.35] [text-wrap:pretty]">
            Audio enters the MLK v3 DSP Kernel — adaptive mastering
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.1vw] pt-[2vh] pb-[2.4vh]">
          <div className="w-[2.6vw] h-[2.6vw] rounded-full bg-primary/15 border border-primary/50 flex items-center justify-center">
            <p className="font-display font-bold text-[1.15vw] text-primary">2</p>
          </div>
          <p className="font-body mt-[2vh] text-[1.15vw] font-semibold tracking-[0.12em] text-primary">
            EMBED
          </p>
          <p className="font-body mt-[1vh] text-[1.6vw] leading-[1.35] [text-wrap:pretty]">
            Robust hybrid watermark embedding
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.1vw] pt-[2vh] pb-[2.4vh]">
          <div className="w-[2.6vw] h-[2.6vw] rounded-full bg-primary/15 border border-primary/50 flex items-center justify-center">
            <p className="font-display font-bold text-[1.15vw] text-primary">3</p>
          </div>
          <p className="font-body mt-[2vh] text-[1.15vw] font-semibold tracking-[0.12em] text-primary">
            RECORD
          </p>
          <p className="font-body mt-[1vh] text-[1.6vw] leading-[1.35] [text-wrap:pretty]">
            Cryptographic provenance record — user + brand + timestamp + hashes
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.1vw] pt-[2vh] pb-[2.4vh]">
          <div className="w-[2.6vw] h-[2.6vw] rounded-full bg-accent/15 border border-accent/50 flex items-center justify-center">
            <p className="font-display font-bold text-[1.15vw] text-accent">4</p>
          </div>
          <p className="font-body mt-[2vh] text-[1.15vw] font-semibold tracking-[0.12em] text-accent">
            ANCHOR
          </p>
          <p className="font-body mt-[1vh] text-[1.6vw] leading-[1.35] [text-wrap:pretty]">
            Optional blockchain anchoring
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.1vw] pt-[2vh] pb-[2.4vh]">
          <div className="w-[2.6vw] h-[2.6vw] rounded-full bg-accent/15 border border-accent/50 flex items-center justify-center">
            <p className="font-display font-bold text-[1.15vw] text-accent">5</p>
          </div>
          <p className="font-body mt-[2vh] text-[1.15vw] font-semibold tracking-[0.12em] text-accent">
            VERIFY
          </p>
          <p className="font-body mt-[1vh] text-[1.6vw] leading-[1.35] [text-wrap:pretty]">
            Server-side verification produces a signed legal report
          </p>
        </div>
      </div>

      <div className="absolute left-[6vw] bottom-[14vh] flex items-center gap-[1vw]">
        <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary" />
        <p className="font-body text-[1.5vw] text-muted">
          Every stage is bound to the one before it — remove a link and verification fails loudly.
        </p>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">MORRIS LAW KERNEL V3.5</p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">04 / 10</p>
      </div>
    </div>
  );
}
