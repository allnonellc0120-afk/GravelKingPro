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

/**
 * Boardroom pitch cut — every scene duration is sized to its narration
 * file (measured via ffprobe) plus a ~1.5s breathing buffer.
 */
export const SCENE_DURATIONS = {
  problem: 5000,
  loophole: 7000,
  solution: 10000,
  cta: 8000,
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  problem: Scene1,
  loophole: Scene2,
  solution: Scene3,
  cta: Scene4,
};

/** Per-scene narration files — each restarts cleanly on scene entry/jump. */
const SCENE_VO: Record<string, string> = {
  problem: 'audio/vo_intro.mp3', // Note: placeholders if audio files don't match names
  loophole: 'audio/vo_hook.mp3',
  solution: 'audio/vo_problem.mp3',
  cta: 'audio/vo_technology.mp3',
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
          className="absolute bg-[#00FFE5] rounded-full blur-[150px] mix-blend-screen"
          animate={{
            x: ['-20vw', '50vw', '80vw', '10vw', '-20vw'][currentScene % 5],
            y: ['-20vh', '30vh', '80vh', '10vh', '-20vh'][currentScene % 5],
            scale: [1, 1.5, 0.8, 1.2, 1][currentScene % 5],
            opacity: [0.08, 0.12, 0.05, 0.1, 0.08][currentScene % 5],
          }}
          transition={{ duration: 8, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ width: '50vw', height: '50vw' }}
        />
        <motion.div
          className="absolute bg-[#F5A623] rounded-full blur-[150px] mix-blend-screen"
          animate={{
            x: ['80vw', '10vw', '-20vw', '50vw', '80vw'][currentScene % 5],
            y: ['80vh', '10vh', '-20vh', '30vh', '80vh'][currentScene % 5],
            scale: [0.8, 1.2, 1, 1.5, 0.8][currentScene % 5],
            opacity: [0.05, 0.1, 0.08, 0.12, 0.05][currentScene % 5],
          }}
          transition={{ duration: 10, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ width: '40vw', height: '40vw' }}
        />
      </div>

      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      {/* Global persistent overlay elements */}
      <div className="absolute bottom-[4vh] left-[3vw] z-40 flex items-center gap-[1vw]">
        <motion.div
          className="w-[0.8vw] h-[0.8vw] rounded-full bg-[#00FFE5]"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="font-mono text-[0.8vw] text-[#71717a] tracking-widest uppercase">
          GravelKing Pro // Promo Cut
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
