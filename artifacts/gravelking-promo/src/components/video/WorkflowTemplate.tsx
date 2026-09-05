import { useEffect, useRef, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { WorkflowScene1 } from './video_scenes/WorkflowScene1';
import { WorkflowScene2 } from './video_scenes/WorkflowScene2';
import { WorkflowScene3 } from './video_scenes/WorkflowScene3';
import { WorkflowScene4 } from './video_scenes/WorkflowScene4';
import { WorkflowScene5 } from './video_scenes/WorkflowScene5';

export const WORKFLOW_SCENE_DURATIONS = {
  w_s1_thank: 9000,
  w_s2_certify: 9000,
  w_s3_sing: 9000,
  w_s4_master: 9000,
  w_s5_sell: 9000,
} as const;

type SceneProps = { vertical?: boolean };
const SCENE_COMPONENTS: Record<string, ComponentType<SceneProps>> = {
  w_s1_thank: WorkflowScene1,
  w_s2_certify: WorkflowScene2,
  w_s3_sing: WorkflowScene3,
  w_s4_master: WorkflowScene4,
  w_s5_sell: WorkflowScene5,
};

export default function WorkflowTemplate({
  durations = WORKFLOW_SCENE_DURATIONS,
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
    music.volume = 0.15;
    music.play().catch(() => {});
  }, [hasEnded, muted]);

  return (
    <div className="video-root w-screen h-screen flex items-center justify-center overflow-hidden bg-[#08090c]">
      <div className="video-frame relative w-full h-full overflow-hidden bg-[#08090c] text-slate-100">
        <div className="noise-overlay absolute inset-0 z-50 opacity-40 mix-blend-overlay pointer-events-none" />
        
        {/* Ambient background that persists across scenes */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <motion.div
            className="absolute -left-[30vw] -top-[10vh] w-[80vw] h-[80vw] rounded-full bg-violet-600/15 blur-[100px]"
            animate={{
              x: ['0%', '20%', '-10%', '0%'],
              y: ['0%', '10%', '15%', '0%'],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute -right-[20vw] -bottom-[10vh] w-[90vw] h-[90vw] rounded-full bg-amber-500/15 blur-[120px]"
            animate={{
              x: ['0%', '-15%', '10%', '0%'],
              y: ['0%', '-20%', '-5%', '0%'],
            }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        {/* Global Logo */}
        <div className="absolute left-[6vw] top-[4vh] z-[45] flex items-center gap-[2vw] font-mono text-[2.5vw] uppercase tracking-[0.2em] text-violet-300">
          <img src={`${import.meta.env.BASE_URL}images/gk_hammer_logo.png`} alt="Logo" className="w-[4vw] h-[4vw] opacity-80" />
          GravelKing Pro
        </div>

        <audio ref={musicRef} src={`${import.meta.env.BASE_URL}audio/gravelking_pro_soundtrack_warm.mp3`} loop={false} preload="auto" />

        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} vertical={true} />}
        </AnimatePresence>

      </div>
    </div>
  );
}