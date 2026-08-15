export default function ReleaseCommand() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#fafbfc] to-[#eef4f5] p-[4vh_4vw] font-body text-primary">
      <div className="flex items-center justify-between border-b border-[#dbe4ea] pb-[2vh] text-[1.5vw] font-bold"><span>GRAVELKING PRO</span><span className="text-muted">RELEASE COMMAND CENTER · 02</span></div>
      <div className="mt-[3vh] flex items-end justify-between">
        <div><p className="text-[1.5vw] font-bold uppercase tracking-[0.14em] text-accent">Operational readiness</p><h1 className="mt-[1vh] text-[4.2vw] font-extrabold tracking-[-0.03em]">Release command center</h1></div>
        <div className="rounded-[1vw] bg-primary px-[2vw] py-[1.4vh] text-[1.5vw] font-bold text-white">4 VERIFIED · 3 OPEN PROOFS</div>
      </div>
      <div className="mt-[4vh] grid grid-cols-2 gap-[1.5vw]">
        <div className="rounded-[1vw] border border-emerald-200 bg-white p-[2.2vh_1.8vw] shadow-sm"><p className="text-[1.65vw] font-bold text-emerald-700">✓ READY — GravelKing Pro web app and API workflows running</p></div>
        <div className="rounded-[1vw] border border-emerald-200 bg-white p-[2.2vh_1.8vw] shadow-sm"><p className="text-[1.65vw] font-bold text-emerald-700">✓ READY — Studio mastering, generation, recording, certification, and verification routes implemented</p></div>
        <div className="rounded-[1vw] border border-emerald-200 bg-white p-[2.2vh_1.8vw] shadow-sm"><p className="text-[1.65vw] font-bold text-emerald-700">✓ READY — $1.99 certificate unlock price wired to Stripe Checkout</p></div>
        <div className="rounded-[1vw] border border-emerald-200 bg-white p-[2.2vh_1.8vw] shadow-sm"><p className="text-[1.65vw] font-bold text-emerald-700">✓ READY — paid webhook unlock is owner-scoped and idempotent</p></div>
        <div className="rounded-[1vw] border border-amber-200 bg-amber-50 p-[2.2vh_1.8vw]"><p className="text-[1.65vw] font-bold text-amber-800">PRODUCTION PROOF — complete a real $1.99 purchase and confirm the document unlocks live</p></div>
        <div className="rounded-[1vw] border border-amber-200 bg-amber-50 p-[2.2vh_1.8vw]"><p className="text-[1.65vw] font-bold text-amber-800">PRODUCTION PROOF — verify sign-up lands on pricing on the published site</p></div>
        <div className="col-span-2 rounded-[1vw] border border-amber-200 bg-amber-50 p-[2.2vh_1.8vw]"><p className="text-[1.65vw] font-bold text-amber-800">DEVICE PROOF — verify recording/export across target browsers and phones</p></div>
      </div>
      <div className="absolute bottom-[3vh] left-[4vw] right-[4vw] flex justify-between border-t border-[#dbe4ea] pt-[1.5vh] text-[1.5vw] text-muted"><span>Green = verified in current code</span><span>Amber = production proof required</span></div>
    </div>
  );
}