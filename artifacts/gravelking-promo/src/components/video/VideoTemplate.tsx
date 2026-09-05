import { useEffect, useRef, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS = {
  s1_prompt: 7000,
  s2_lyrics: 10000,
  s3_compose: 9000,
  s4_booth: 16000,
  s5_master: 9000,
  s6_finish: 8000,
} as const;

type SceneProps = { vertical?: boolean };
const SCENE_COMPONENTS: Record<string, ComponentType<SceneProps>> = {
  s1_prompt: Scene1,
  s2_lyrics: Scene2,
  s3_compose: Scene3,
  s4_booth: Scene4,
  s5_master: Scene5,
  s6_finish: Scene6,
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
    <div className="video-root w-screen h-screen flex items-center justify-center overflow-hidden bg-[#08090c]">
      <div className="video-frame relative w-full h-full overflow-hidden bg-[#08090c] text-slate-100">
        <div className="noise-overlay absolute inset-0 z-50 opacity-40 mix-blend-overlay" />
        
        {/* Ambient background that persists across scenes */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <motion.div
            className="absolute -left-[30vw] -top-[10vh] w-[80vw] h-[80vw] rounded-full bg-violet-600/10 blur-[80px]"
            animate={{
              x: ['0%', '20%', '-10%', '0%'],
              y: ['0%', '10%', '15%', '0%'],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute -right-[20vw] -bottom-[10vh] w-[90vw] h-[90vw] rounded-full bg-amber-500/10 blur-[100px]"
            animate={{
              x: ['0%', '-15%', '10%', '0%'],
              y: ['0%', '-20%', '-5%', '0%'],
            }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        <div className="absolute left-[6vw] top-[4vh] z-45 flex items-center gap-[1.5vw] font-mono text-[2.5vw] uppercase tracking-[0.2em] text-violet-300">
          <span className="h-[1.5vw] w-[1.5vw] rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,.7)]" />
          GravelKing Pro
        </div>

        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} vertical={true} />}
        </AnimatePresence>

      </div>
    </div>
  );
}
