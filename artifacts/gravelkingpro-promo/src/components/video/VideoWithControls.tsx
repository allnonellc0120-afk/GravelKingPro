import { useCallback, useEffect, useRef, useState } from 'react';
import { Repeat, Volume2, VolumeX, ChevronDown, ChevronUp, Download } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from '@/hooks/useSceneControls';

const PROGRESS_TICK_MS = 60;

interface ControlBarProps {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  muted: boolean;
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onToggleLock: () => void;
  onToggleMuted: () => void;
  onJumpTo: (index: number) => void;
  onToggleCollapsed: () => void;
}

function ProgressSegments({
  sceneKeys, activeIndex, activeDuration, tick, onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;

  return (
    <div className="flex-1 flex items-center gap-1.5">
      {sceneKeys.map((key, i) => {
        const isActive = i === activeIndex;
        const fill = isActive ? progress * 100 : 0;
        return (
          <button
            key={key}
            onClick={() => onJumpTo(i)}
            className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 hover:bg-white/25 transition-all relative min-h-[12px]"
            aria-label={`Jump to scene ${i + 1}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/90 rounded-full transition-[width] duration-100"
              style={{ width: `${fill}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

function ControlBar({
  visible, collapsed, locked, muted, sceneKeys, activeIndex, activeDuration, tick,
  onToggleLock, onToggleMuted, onJumpTo, onToggleCollapsed,
}: ControlBarProps) {
  return (
    <div
      className={`flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-4 transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <button
        onClick={onToggleLock}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          locked
            ? 'text-white bg-white/15 hover:bg-white/25'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
        title={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-pressed={locked}
      >
        <Repeat className="w-8 h-8" />
      </button>

      <button
        onClick={onToggleMuted}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          !muted
            ? 'text-white bg-white/15 hover:bg-white/25'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
        title={muted ? 'Unmute audio' : 'Mute audio'}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}
      </button>

      <div className="w-px self-stretch bg-white/15" aria-hidden="true" />

      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
      />

      <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </div>

      <button
        onClick={onToggleCollapsed}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0"
        title={collapsed ? 'Show controls' : 'Hide controls'}
        aria-label={collapsed ? 'Show controls' : 'Hide controls'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}
      </button>
    </div>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const isExport = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === '1';

  const {
    sceneKeys, activeIndex, locked, mountKey, tick,
    durations, activeDuration, onSceneChange, jumpTo, toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const AUTO_HIDE_MS = 2500;
  const [muted, setMuted] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(true);
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const mp4Path = `${import.meta.env.BASE_URL}videos/gravelkingpro_lyrics_generator_30s_16x9.mp4`;

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setCollapsed(true);
      setTapPinned(false);
      setHovering(false);
    }, AUTO_HIDE_MS);
  }, []);
  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      setHovering(true);
      resetHideTimer();
    }
  }, [resetHideTimer]);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(false);
  }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    if (collapsed) setTapPinned(true);
    resetHideTimer();
  }, [collapsed, resetHideTimer]);
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed(c => {
      const next = !c;
      if (next) {
        setHovering(false);
        setTapPinned(false);
      } else {
        resetHideTimer();
      }
      return next;
    });
  }, [resetHideTimer]);
  const handleToggleMuted = useCallback(() => {
    // Unlock audio inside the current user gesture; iOS Safari requires this.
    document.querySelectorAll('audio').forEach((a) => {
      a.muted = false;
      a.play().catch(() => {});
    });
    setMuted(false);
    setNeedsGesture(false);
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const sensor = sensorRef.current;
      if (sensor && !sensor.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [collapsed, tapPinned]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(mp4Path, { method: 'HEAD' });
        if (alive && res.ok) setMp4Url(mp4Path);
      } catch {}
    };
    check();
    const id = window.setInterval(check, 15000);
    return () => { alive = false; window.clearInterval(id); };
  }, [mp4Path]);

  const barVisible = !collapsed || hovering || tapPinned;
  const showGestureOverlay = needsGesture;

  // Export path: clean, no controls, unmuted audio. Add ?format=vertical for 9:16.
  if (isExport) return <VideoTemplate muted={false} />;

  return (
    <div className="relative w-full h-screen">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        onSceneChange={onSceneChange}
      />
      {mp4Url && (
        <a
          href={mp4Url}
          download
          className="absolute top-4 right-4 z-[55] flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur-sm text-white rounded-full text-sm font-semibold hover:bg-white/10 transition-colors"
          aria-label="Download MP4"
        >
          <Download className="w-5 h-5" />
          <span className="hidden sm:inline">Download MP4</span>
        </a>
      )}
      {showGestureOverlay && (
        <button
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 text-white touch-manipulation"
          onPointerDown={handleToggleMuted}
          aria-label="Tap to play with sound"
          style={{ touchAction: 'manipulation' }}
        >
          <div className="flex flex-col items-center gap-4 pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
              <Volume2 className="w-10 h-10" />
            </div>
            <span className="text-lg font-semibold tracking-wide">Tap to play with sound</span>
          </div>
        </button>
      )}
      <div
        ref={sensorRef}
        className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end"
        style={{ height: '25%' }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        <div className="flex-1 w-full" aria-hidden="true" />
        <ControlBar
          visible={barVisible}
          collapsed={collapsed}
          locked={locked}
          muted={muted}
          sceneKeys={sceneKeys}
          activeIndex={activeIndex}
          activeDuration={activeDuration}
          tick={tick}
          onToggleLock={toggleLock}
          onToggleMuted={handleToggleMuted}
          onJumpTo={jumpTo}
          onToggleCollapsed={handleToggleCollapsed}
        />
      </div>
    </div>
  );
}
