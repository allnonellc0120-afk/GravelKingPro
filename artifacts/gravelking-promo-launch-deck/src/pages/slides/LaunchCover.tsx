import hero from '@assets/generated_images/gravelking_authorship_workflow.png';
const base = import.meta.env.BASE_URL;
export default function LaunchCover() {
  return <div className="relative w-screen h-screen overflow-hidden bg-[#0c080f]">
    <img src={hero} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover opacity-45" alt="Creator authorship workflow" />
    <div className="absolute inset-0 bg-gradient-to-r from-[#0c080f] via-[#0c080f]/85 to-[#0c080f]/20" />
    <div className="relative z-10 flex h-full flex-col justify-center px-[8vw]">
      <div className="font-body text-[1.2vw] tracking-[.22em] text-[#9b8bb4]">GRAVELKING PRO <span className="text-[#c4a060]">—</span> LAUNCH CAMPAIGN</div>
      <h1 className="mt-[4vh] max-w-[62vw] font-display text-[6.2vw] font-semibold leading-[1.02] text-[#f0ece4]">Make the song.<br/>Keep the proof.</h1>
      <div className="mt-[5vh] h-[.25vh] w-[9vw] bg-[#c4a060]" />
      <p className="mt-[4vh] max-w-[43vw] font-display text-[2vw] italic leading-[1.45] text-[#9b8bb4]">GravelKing Pro launch campaign<br/>A 30-day content system for creators, collaborators, and music businesses.</p>
      <div className="absolute bottom-[5vh] right-[7vw] font-body text-[1vw] tracking-[.12em] text-[#9b8bb4]">gravelkingpro.com · Vol. I</div>
    </div>
  </div>;
}