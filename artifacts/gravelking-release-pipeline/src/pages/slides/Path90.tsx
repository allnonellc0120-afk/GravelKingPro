export default function Path90() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>HOW IT WORKS · STEP 2</div>
        </div>
        <p className="mt-[3vh] text-[1.5vw] font-bold uppercase tracking-[0.16em] text-[#5eead4]">Write, record, and create in the browser</p>
        <h2 className="mt-[0.8vh] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>A full creative workspace — no install required</h2>
        <div className="mt-[3.5vh] grid grid-cols-2 gap-[1.6vw]">
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Browser DAW</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Arrange tracks, apply EQ and effects, and mix ideas in the karaoke DAW — all from a browser tab.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Vocal Booth</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Record vocals with baked-in effects and live lyric sync. The monitor mix and the recording stay in step.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">AI-assisted generation</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Generate instrumental ideas and full tracks. Every generated piece is labeled as machine-made before it touches your vault.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.1em] text-[#f59e0b]">Lyrics workspace</p>
            <p className="mt-[1vh] text-[1.7vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Write and time your lyrics in the same workspace. Self-written verses carry a separate authorship stamp on the certificate.</p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Create, record, and keep everything in one place</div>
          <div>08</div>
        </div>
      </div>
    </div>
  );
}
