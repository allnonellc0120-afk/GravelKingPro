import { useEffect, useRef, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const QUERY = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

export const SCENE_DURATIONS = {
  origin: 4500,
  spark: 5500,
  generate: 7000,
  own: 7000,
  workflow: 6000,
} as const;

type SceneProps = { vertical?: boolean };
const SCENE_COMPONENTS: Record<string, ComponentType<SceneProps>> = {
  origin: Scene1,
  spark: Scene2,
  generate: Scene3,
  own: Scene4,
  workflow: Scene5,
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
  const { currentSceneKey, currentScene, hasEnded } = useVideoPlayer({ durations, loop });
  const SceneComponent = SCENE_COMPONENTS[currentSceneKey.replace(/_r[12]$/, '')];
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const vertical = QUERY?.get('format') === 'vertical' || QUERY?.get('format') === '9x16';

  useEffect(() => onSceneChange?.(currentSceneKey), [currentSceneKey, onSceneChange]);
  useEffect(() => {
    if (hasEnded) onVideoEnd?.();
  }, [hasEnded, onVideoEnd]);
  useEffect(() => {
    const music = musicRef.current;
    if (!music || hasEnded) return;
    music.muted = muted;
    music.volume = 0.12;
    music.play().catch(() => {});
  }, [hasEnded, muted]);

  return (
    <div className="video-root w-screen h-[100dvh] flex items-center justify-center overflow-hidden bg-[#18120f]">
      <div className={`video-frame ${vertical ? 'vertical' : 'landscape'} relative w-full h-auto max-h-[100dvh] overflow-hidden bg-[#18120f] text-[#f3eadb]`}>
        <div className="noise-overlay absolute inset-0 z-50" />
        <div className="film-grain absolute inset-0 z-40 pointer-events-none opacity-20" />
        <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_16%_20%,rgba(210,105,42,.26),transparent_35%),radial-gradient(circle_at_88%_82%,rgba(236,182,60,.17),transparent_34%),linear-gradient(125deg,#18120f,#2a1811_55%,#17110e)]" />
        <motion.div
          className="absolute -left-[16%] -top-[26%] z-0 h-[80%] w-[62%] rounded-full bg-[#d66d35]/10 blur-[70px]"
          animate={{
            x: ['0%', '24%', '-8%', '0%'][currentScene % 4],
            y: ['0%', '10%', '24%', '0%'][currentScene % 4],
            scale: [1, 1.12, .9, 1][currentScene % 4],
          }}
          transition={{ duration: 7, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="absolute -right-[20%] -bottom-[30%] z-0 h-[70%] w-[55%] rounded-full bg-[#eab83f]/10 blur-[90px]"
          animate={{
            x: ['0%', '-18%', '8%', '0%'][currentScene % 4],
            y: ['0%', '-12%', '-4%', '0%'][currentScene % 4],
            scale: [.9, 1.05, .82, .9][currentScene % 4],
          }}
          transition={{ duration: 8.5, ease: [0.16, 1, 0.3, 1] }}
        />
        <div className="absolute left-[4.5%] top-[4.5%] z-45 flex items-center gap-2 font-mono text-[clamp(7px,0.7vw,12px)] uppercase tracking-[0.24em] text-[#e7c56d]/85">
          <span className="h-2 w-2 rounded-full bg-[#e5a62e] shadow-[0_0_12px_rgba(229,166,46,.6)]" />
          GravelKing Pro / Lyrics Generator
        </div>
        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} vertical={vertical} />}
        </AnimatePresence>
        <audio
          ref={musicRef}
          src={`${import.meta.env.BASE_URL}audio/gravelking_pro_soundtrack.mp3`}
          preload="auto"
          autoPlay
          loop
          muted={muted}
        />
      </div>
    </div>
  );
}