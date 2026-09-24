import { useEffect, type ComponentType } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { GkaAuditScenes } from './video_scenes/GkaAuditScenes';

export const SCENE_DURATIONS = {
  gka_bleed: 8000,
  gka_carve: 10000,
  gka_proof: 7000,
  gka_cta: 5000,
} as const;

type SceneProps = { vertical?: boolean };
const SCENE_COMPONENTS: Record<string, ComponentType<SceneProps>> = {
  gka_bleed: GkaAuditScenes[0],
  gka_carve: GkaAuditScenes[1],
  gka_proof: GkaAuditScenes[2],
  gka_cta: GkaAuditScenes[3],
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

  return (
    <div className="video-root w-screen h-screen flex items-center justify-center overflow-hidden bg-[#030509]">
      <div 
        className="video-frame landscape relative overflow-hidden bg-[#05080d] text-slate-100 flex-shrink-0"
        style={{
          aspectRatio: '16 / 9',
          width: 'min(100vw, 177.78vh)',
          height: 'min(56.25vw, 100vh)',
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      >
        <div className="noise-overlay absolute inset-0 z-50 opacity-15 mix-blend-overlay pointer-events-none" 
             style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} 
        />
        
        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} vertical={false} />}
        </AnimatePresence>

      </div>
    </div>
  );
}
