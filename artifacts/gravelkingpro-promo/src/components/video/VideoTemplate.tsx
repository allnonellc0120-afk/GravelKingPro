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
  rights_alert: 5000,
  law_fact:     7000,
  forensic:     8000,
  ip_embed:    10000,
  workflow:    10000,
  outro:        5000,
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  rights_alert: Scene1,
  law_fact:     Scene2,
  forensic:     Scene3,
  ip_embed:     Scene4,
  workflow:     Scene5,
  outro:        Scene6,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey, currentScene } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Persistent ambient layer */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute border border-white/5 opacity-40 mix-blend-overlay"
          animate={{
            x: ['-10vw', '40vw', '10vw', '-10vw'][currentScene % 4],
            y: ['20vh', '-10vh', '50vh', '20vh'][currentScene % 4],
            scale: [1, 2, 1.5, 1][currentScene % 4],
            rotate: [0, 45, -45, 0][currentScene % 4],
          }}
          transition={{ duration: 5, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '40vw', height: '40vw' }}
        />
        <motion.div
          className="absolute bg-[#c9a227] rounded-full blur-[150px] opacity-10 mix-blend-screen"
          animate={{
            x: ['80vw', '10vw', '50vw', '80vw'][currentScene % 4],
            y: ['80vh', '20vh', '-20vh', '80vh'][currentScene % 4],
            scale: [1, 0.8, 1.2, 1][currentScene % 4],
          }}
          transition={{ duration: 7, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '50vw', height: '50vw' }}
        />
      </div>

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/gravelking_pro_soundtrack.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
