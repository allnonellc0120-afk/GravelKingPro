export default function SyncChecklist() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      {/* Subtle amber grid texture */}
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#f59e0b 0,#f59e0b 1px,transparent 1px,transparent 60px),repeating-linear-gradient(90deg,#f59e0b 0,#f59e0b 1px,transparent 1px,transparent 60px)' }} />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        {/* Header */}
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80">
            <span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />
            GRAVELKING PRODUCTIONS
          </div>
          <div className="flex items-center gap-[1vw]">
            <span className="rounded-[0.4vw] bg-[#f59e0b]/20 px-[0.8vw] py-[0.3vh] text-[1.2vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">
              ⚑ Release Checklist
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="mt-[2.5vh] font-display text-[3.4vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          Before you push to F6S or send investor outreach
        </h2>
        <p className="mt-[1.2vh] text-[1.8vw] text-white/55">
          Complete every step in order — investor contacts see the deck before any reply lands.
        </p>

        {/* Checklist */}
        <div className="mt-[3vh] flex flex-col gap-[1.4vh]">

          {/* Step 1 — highlighted, this is the sync step */}
          <div className="flex items-start gap-[1.6vw] rounded-[0.8vw] border border-[#f59e0b]/50 bg-[#f59e0b]/10 px-[1.8vw] py-[1.4vh]">
            <span className="mt-[0.1vh] shrink-0 font-display text-[2.8vw] font-bold leading-none text-[#f59e0b]">01</span>
            <div className="flex-1">
              <p className="text-[1.8vw] font-bold text-white">Re-export the investor deck PDF</p>
              <p className="mt-[0.4vh] text-[1.55vw] leading-[1.4] text-white/72">
                Run <code className="rounded bg-white/10 px-[0.5vw] py-[0.15vh] font-mono text-[1.4vw] text-[#5eead4]">pnpm --filter @workspace/gravelking-release-pipeline export-deck</code> from the repo root, or open <span className="font-semibold text-white">/allslides</span> in the browser and print → Save as PDF (slides are 1920×1080, landscape A4).
              </p>
              <p className="mt-[0.5vh] text-[1.45vw] text-[#f59e0b]/80">
                Output: <code className="font-mono text-[1.35vw]">.local/outputs/GravelKing-Productions-F6S-Investor-Deck.pdf</code>
              </p>
              <p className="mt-[0.5vh] text-[1.45vw] text-white/55">
                ✦ The cover footer will show an <span className="font-semibold text-white/80">"Exported [Month Year]"</span> stamp — confirm it matches today before uploading.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-[1.6vw] rounded-[0.8vw] border border-white/12 bg-white/5 px-[1.8vw] py-[1.4vh]">
            <span className="mt-[0.1vh] shrink-0 font-display text-[2.8vw] font-bold leading-none text-white/40">02</span>
            <div className="flex-1">
              <p className="text-[1.8vw] font-bold text-white">Replace the file on F6S</p>
              <p className="mt-[0.4vh] text-[1.55vw] leading-[1.4] text-white/72">
                Log in to F6S → Edit Application → Upload Pitch Deck. Overwrite with the new PDF. Verify the preview renders correctly before saving.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-[1.6vw] rounded-[0.8vw] border border-white/12 bg-white/5 px-[1.8vw] py-[1.4vh]">
            <span className="mt-[0.1vh] shrink-0 font-display text-[2.8vw] font-bold leading-none text-white/40">03</span>
            <div className="flex-1">
              <p className="text-[1.8vw] font-bold text-white">Check outreach email links</p>
              <p className="mt-[0.4vh] text-[1.55vw] leading-[1.4] text-white/72">
                Any email template or saved draft that links to the old deck file must be updated to the new upload URL before sending.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex items-start gap-[1.6vw] rounded-[0.8vw] border border-white/12 bg-white/5 px-[1.8vw] py-[1.4vh]">
            <span className="mt-[0.1vh] shrink-0 font-display text-[2.8vw] font-bold leading-none text-white/40">04</span>
            <div className="flex-1">
              <p className="text-[1.8vw] font-bold text-white">Spot-check one slide for content accuracy</p>
              <p className="mt-[0.4vh] text-[1.55vw] leading-[1.4] text-white/72">
                Open the exported PDF and confirm pricing figures, live dates, and the CTA URL match the current live site.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Slide content changes require a new export — the PDF is not auto-updated</div>
          <div>gravelkingpro.it.com</div>
        </div>
      </div>
    </div>
  );
}
