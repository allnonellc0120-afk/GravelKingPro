import { useEffect, useRef, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';

export const SCENE_DURATIONS = {
  s1_reveal: 8000,
} as const;

type SceneProps = { vertical?: boolean };
const SCENE_COMPONENTS: Record<string, ComponentType<SceneProps>> = {
  s1_reveal: Scene1,
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

  useEffect(() => onSceneChange?.(currentSceneKey), [currentSceneKey, onSceneChange]);
  useEffect(() => {
    if (hasEnded) onVideoEnd?.();
  }, [hasEnded, onVideoEnd]);

  // Aspect Ratio 4:5 Container
  return (
    <div className="video-root w-screen h-screen flex items-center justify-center overflow-hidden bg-[#050608]">
      <div 
        className="video-frame relative overflow-hidden bg-[#050608] text-slate-100 flex-shrink-0"
        style={{
          aspectRatio: '4 / 5',
          height: '100vh',
          maxHeight: '100vh',
          width: '80vh',
          maxWidth: '100vw',
        }}
      >
        <div className="noise-overlay absolute inset-0 z-50 opacity-15 mix-blend-overlay pointer-events-none" 
             style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} 
        />
        
        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} vertical={true} />}
        </AnimatePresence>

      </div>
    </div>
  );
}
