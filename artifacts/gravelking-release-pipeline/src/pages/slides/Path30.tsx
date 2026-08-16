export default function Path30() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>HOW IT WORKS · STEP 1</div>
        </div>
        <p className="mt-[3vh] text-[1.5vw] font-bold uppercase tracking-[0.16em] text-[#5eead4]">Upload and master</p>
        <h2 className="mt-[0.8vh] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Bring your track — leave with a polished, release-ready file</h2>
        <div className="mt-[3.5vh] grid grid-cols-2 gap-[1.6vw]">
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Upload any format</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Drag in WAV, MP3, FLAC, or a recording straight from the browser — the platform handles the rest.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Guided mastering</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>The multi-band mastering pipeline shapes the low end, mid range, and highs into a balanced, streaming-ready sound.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Preview before download</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Hear the mastered result in the browser and compare it against the original before committing to a download.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Your vault</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Every mastered track is stored in your private vault — accessible from any device, ready to certify next.</p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Minutes from upload to a release-ready master</div>
          <div>07</div>
        </div>
      </div>
    </div>
  );
}
