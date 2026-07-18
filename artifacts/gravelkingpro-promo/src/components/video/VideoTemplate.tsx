import { useEffect, useRef, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';

/**
 * Poster/QA mode: `/?still` renders every animation at its final state
 * instantly (no fades), `/?scene=<key>` starts playback at that scene.
 * Used for screenshots and quick visual checks; harmless in normal playback.
 */
const QUERY = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
if (QUERY?.has('still') && typeof document !== 'undefined') {
  // CSS-forced poster mode: !important beats framer-motion's inline styles,
  // so every element shows at full visibility regardless of animation state.
  document.documentElement.classList.add('poster-mode');
}

function rotateDurations(
  durations: Record<string, number>,
  startKey: string | null,
): Record<string, number> {
  if (!startKey || !(startKey in durations)) return durations;
  const keys = Object.keys(durations);
  const start = keys.indexOf(startKey);
  const out: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    out[key] = durations[key];
  }
  return out;
}
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';
import { Scene9 } from './video_scenes/Scene9';

/**
 * Boardroom pitch cut — every scene duration is sized to its narration
 * file (measured via ffprobe) plus a ~1.5s breathing buffer.
 */
export const SCENE_DURATIONS = {
  intro: 19500, // vo 17.8s — welcome
  hook: 16000, // vo 14.5s — 200M tracks, zero certified
  problem: 25500, // vo 23.7s — the copyright ruling
  technology: 25500, // vo 23.7s — MLK V3.5 patent pending
  product: 25500, // vo 23.7s — four tools, $9.99
  market: 25500, // vo 23.7s — the market is ownership
  revenue: 38000, // vo 36.0s — three streams, $1M ARR
  moat: 25500, // vo 23.7s — the accumulated record
  ask: 27500, // vo 25.5s — partner / acquire / invest
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  intro: Scene1,
  hook: Scene2,
  problem: Scene3,
  technology: Scene4,
  product: Scene5,
  market: Scene6,
  revenue: Scene7,
  moat: Scene8,
  ask: Scene9,
};

/** Per-scene narration files — each restarts cleanly on scene entry/jump. */
const SCENE_VO: Record<string, string> = {
  intro: 'audio/vo_intro.mp3',
  hook: 'audio/vo_hook.mp3',
  problem: 'audio/vo_problem.mp3',
  technology: 'audio/vo_technology.mp3',
  product: 'audio/vo_product.mp3',
  market: 'audio/vo_market.mp3',
  revenue: 'audio/vo_revenue.mp3',
  moat: 'audio/vo_moat.mp3',
  ask: 'audio/vo_ask.mp3',
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = false,
  muted = false,
  onVideoEnd,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onVideoEnd?: () => void;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  // `?scene=` rotation applies ONLY to the default duration map (direct URL mode).
  // VideoWithControls passes its own already-rotated map on scene jumps — re-rotating
  // it here would override the jump target and desync controls from playback/VO.
  const { currentSceneKey, currentScene, hasEnded } = useVideoPlayer({
    durations:
      durations === SCENE_DURATIONS
        ? rotateDurations(durations, QUERY?.get('scene') ?? null)
        : durations,
    loop,
  });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    if (hasEnded) onVideoEnd?.();
  }, [hasEnded, onVideoEnd]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voRef = useRef<HTMLAudioElement | null>(null);

  // Ambient music bed: quiet loop underneath the narration.
  useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    if (hasEnded) {
      m.pause();
      return;
    }
    m.volume = 0.1;
    m.play().catch(() => {});
  }, [hasEnded, muted]);

  // Voice-over: load this scene's narration and play from the top.
  useEffect(() => {
    const vo = voRef.current;
    if (!vo) return;
    if (hasEnded) {
      vo.pause();
      return;
    }
    const src = SCENE_VO[baseSceneKey];
    if (!src) return;
    if (vo.src !== `${import.meta.env.BASE_URL}${src}`) {
      vo.src = `${import.meta.env.BASE_URL}${src}`;
      vo.currentTime = 0;
    }
    vo.volume = 1.0;
    vo.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, hasEnded, muted]);

  return (
    <div className="w-screen h-screen flex items-center justify-center overflow-hidden bg-black">
      <div className="relative w-full max-w-[177.78vh] aspect-video max-h-screen overflow-hidden bg-[#09090b] text-[#fafafa] font-['Outfit']">
        {/* Noise texture */}
        <div className="noise-overlay z-50"></div>

      {/* Persistent ambient layer across scenes */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div
          className="absolute bg-[#f59e0b] rounded-full blur-[120px] mix-blend-screen"
          animate={{
            x: ['-20vw', '50vw', '80vw', '10vw', '-20vw'][currentScene % 5],
            y: ['-20vh', '30vh', '80vh', '10vh', '-20vh'][currentScene % 5],
            scale: [1, 1.5, 0.8, 1.2, 1][currentScene % 5],
            opacity: [0.05, 0.08, 0.04, 0.07, 0.05][currentScene % 5],
          }}
          transition={{ duration: 8, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ width: '40vw', height: '40vw' }}
        />
      </div>

      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      {/* Global persistent overlay elements */}
      <div className="absolute bottom-[4vh] left-[3vw] z-40 flex items-center gap-[1vw]">
        <motion.div
          className="w-[0.8vw] h-[0.8vw] rounded-full bg-[#f59e0b]"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="font-mono text-[0.8vw] text-[#71717a] tracking-widest uppercase">
          GravelKing Pro // Investor Cut
        </span>
      </div>

        {/* Ambient music bed (quiet, looping) */}
        <audio
          ref={musicRef}
          src={`${import.meta.env.BASE_URL}audio/gravelking_pro_soundtrack.mp3`}
          preload="auto"
          autoPlay
          loop
          muted={muted}
        />
        {/* Per-scene voice-over narration */}
        <audio ref={voRef} preload="auto" autoPlay muted={muted} />
      </div>
    </div>
  );
}
