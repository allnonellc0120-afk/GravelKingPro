import { motion } from 'framer-motion';
import { FullBleed, PageTag } from './pitchKit';

/** Scene 5 — PAGE 04: THE PRODUCT. Four tools, one subscription. */
export function Scene5() {
  return (
    <FullBleed img="slide_product.jpg" zoomFrom={1.02} zoomTo={1.05} duration={25}>
      <PageTag num="04" label="The Product" />

      <motion.div
        className="absolute bottom-[5vh] left-0 right-0 z-30 flex justify-center"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 19, duration: 0.9 }}
      >
        <div className="flex items-center gap-[1.4vw] bg-black/65 border border-amber-500/45 px-[2.2vw] py-[1.4vh]">
          <span className="text-[2.4vw] font-black text-amber-400 leading-none">$9.99</span>
          <span className="text-[0.95vw] text-white/85 font-semibold uppercase tracking-[0.2em]">
            per month · browser native · no download
          </span>
        </div>
      </motion.div>
    </FullBleed>
  );
}
