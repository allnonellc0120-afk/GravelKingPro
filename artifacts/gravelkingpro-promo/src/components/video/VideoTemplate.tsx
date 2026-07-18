import { useEffect, useRef, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';
import { Scene9 } from './video_scenes/Scene9';

export const SCENE_DURATIONS = {
  intro: 6000,
  songwriting: 9000,
  mastering: 9000,
  mix_studio: 9000,
  vocal_booth: 9000,
  ip_cert: 9000,
  authorship: 11000,
  label: 9000,
  outro: 12000,
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  intro: Scene1,
  songwriting: Scene2,
  mastering: Scene3,
  mix_studio: Scene4,
  vocal_booth: Scene5,
  ip_cert: Scene6,
  authorship: Scene9,
  label: Scene7,
  outro: Scene8,
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

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (hasEnded) {
      audio.pause();
      return;
    }

    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted, hasEnded]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#09090b] text-[#fafafa] font-['Outfit']">
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
        <motion.div
          className="absolute bg-[#71717a] rounded-full blur-[150px] mix-blend-screen"
          animate={{
            x: ['80vw', '20vw', '-10vw', '60vw', '80vw'][currentScene % 5],
            y: ['80vh', '10vh', '60vh', '-10vh', '80vh'][currentScene % 5],
            scale: [1.2, 0.9, 1.4, 0.8, 1.2][currentScene % 5],
            opacity: [0.03, 0.06, 0.02, 0.05, 0.03][currentScene % 5],
          }}
          transition={{ duration: 10, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ width: '50vw', height: '50vw' }}
        />
        
        {/* Dynamic framing lines */}
        <motion.div
          className="absolute top-0 left-8 w-[1px] h-full bg-gradient-to-b from-transparent via-[#f59e0b]/20 to-transparent"
          animate={{
            y: ['-100%', '100%']
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute top-0 right-8 w-[1px] h-full bg-gradient-to-b from-transparent via-[#f59e0b]/20 to-transparent"
          animate={{
            y: ['100%', '-100%']
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
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
          GravelKing Pro // Studio V3.5
        </span>
      </div>

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
