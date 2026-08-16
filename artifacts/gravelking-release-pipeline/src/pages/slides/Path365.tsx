export default function Path365() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>HOW IT WORKS · STEP 3</div>
        </div>
        <p className="mt-[3vh] text-[1.5vw] font-bold uppercase tracking-[0.16em] text-[#5eead4]">Certify and share with confidence</p>
        <h2 className="mt-[0.8vh] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>A release record built to travel with your music</h2>
        <div className="mt-[3.5vh] grid grid-cols-4 gap-[1.4vw]">
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Catalog screen</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>The platform screens your track against the commercial catalog. A clean result is part of the certificate record.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Attribution</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Human authorship score and AI model credits are written into the certificate before the document is issued.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Shareable link</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Every certificate has a public verification link — send it to a label, collaborator, or partner so they can confirm what they're hearing.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Mobile ready</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>The full platform runs on Android and iOS — master, certify, and share a release from wherever you work.</p>
          </div>
        </div>
        <div className="mt-[3vh] rounded-[0.8vw] border border-[#f59e0b]/35 bg-[#f59e0b]/10 p-[1.5vw]">
          <p className="text-[1.8vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#f59e0b]">The result:</span> every release you share comes with a verifiable record of who made it, how it was made, and that it cleared a catalog check before release.</p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Certificate stamping is free — the court-ready PDF document is $1.99</div>
          <div>09</div>
        </div>
      </div>
    </div>
  );
}
