import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
import {
  createMasteringEqChain,
  decodeAudioUrl,
  updateMasteringEqChain,
} from "@/lib/mastering-eq";

interface Track { label: string; sub: string; src: string }

interface BeforeAfterDemoProps {
  before: Track;
  after: Track;
  bandGains?: readonly number[];
  postEqGain?: number;
  heading?: string;
  sub?: string;
}

function DemoCard({
  track, playing, onToggle, accent,
}: {
  track: Track; playing: boolean; onToggle: () => void; accent: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
      accent
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border/40 bg-card/30"
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">{track.label}</p>
          <p className="text-[10px] text-muted-foreground">{track.sub}</p>
        </div>
        <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
          accent
            ? "bg-amber-500 hover:bg-amber-600 text-black"
            : "border border-border/50 text-foreground hover:bg-secondary/60"
        }`}
      >
        {playing
          ? <><Pause className="w-3.5 h-3.5" />Pause</>
          : <><Play className="w-3.5 h-3.5 fill-current" />Play {track.label}</>}
      </button>
    </div>
  );
}

export function BeforeAfterDemo({
  before, after, heading = "Hear the difference", sub = "Same clip — before and after processing.",
  bandGains = [], postEqGain = 0,
}: BeforeAfterDemoProps) {
  const beforeRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const chainRef = useRef<ReturnType<typeof createMasteringEqChain> | null>(null);
  const eqRef = useRef({ bandGains, postEqGain });
  const [playingBefore, setPlayingBefore] = useState(false);
  const [playingAfter,  setPlayingAfter]  = useState(false);
  const [loadingAfter, setLoadingAfter] = useState(true);
  const [afterError, setAfterError] = useState<string | null>(null);

  useEffect(() => {
    eqRef.current = { bandGains, postEqGain };
    const chain = chainRef.current;
    const context = contextRef.current;
    if (chain && context) {
      updateMasteringEqChain(chain, bandGains, postEqGain, context.currentTime);
    }
  }, [bandGains, postEqGain]);

  const getAudioContext = useCallback((): AudioContext => {
    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const stopAfter = useCallback(() => {
    const source = sourceRef.current;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
      sourceRef.current = null;
    }
    chainRef.current?.filters.forEach((filter) => filter.disconnect());
    chainRef.current?.outputGain.disconnect();
    chainRef.current = null;
    setPlayingAfter(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingAfter(true);
    setAfterError(null);
    bufferRef.current = null;
    void (async () => {
      try {
        const buffer = await decodeAudioUrl(getAudioContext(), after.src);
        if (cancelled) return;
        bufferRef.current = buffer;
        setLoadingAfter(false);
      } catch (error) {
        if (cancelled) return;
        setLoadingAfter(false);
        setAfterError(error instanceof Error ? error.message : "After preview unavailable.");
      }
    })();
    return () => {
      cancelled = true;
      stopAfter();
    };
  }, [after.src, getAudioContext, stopAfter]);

  useEffect(() => () => {
    stopAfter();
    void contextRef.current?.close().catch(() => {});
  }, [stopAfter]);

  const toggle = async (side: "before" | "after") => {
    if (side === "before") {
      const beforeAudio = beforeRef.current;
      if (!beforeAudio) return;
      if (!beforeAudio.paused) {
        beforeAudio.pause();
        return;
      }
      stopAfter();
      await beforeAudio.play().catch(() => {});
      return;
    }

    if (playingAfter) {
      stopAfter();
      return;
    }

    beforeRef.current?.pause();
    try {
      const context = getAudioContext();
      await context.resume();
      const buffer = bufferRef.current ?? await decodeAudioUrl(context, after.src);
      bufferRef.current = buffer;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const chain = createMasteringEqChain(
        context,
        source,
        eqRef.current.bandGains,
        eqRef.current.postEqGain,
      );
      chain.outputGain.connect(context.destination);
      sourceRef.current = source;
      chainRef.current = chain;
      source.onended = () => {
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        chainRef.current = null;
        setPlayingAfter(false);
      };
      source.start();
      setPlayingAfter(true);
    } catch (error) {
      setAfterError(error instanceof Error ? error.message : "After preview unavailable.");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/30 bg-card/20 p-4">
      <div>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DemoCard track={before} playing={playingBefore} accent={false} onToggle={() => toggle("before")} />
        <DemoCard
          track={after}
          playing={playingAfter}
          accent={true}
          onToggle={() => void toggle("after")}
        />
      </div>
      {loadingAfter && <p className="text-[10px] text-muted-foreground">Preparing the mastered preview…</p>}
      {afterError && <p className="text-[10px] text-rose-300">{afterError}</p>}
      <audio ref={beforeRef} src={before.src} preload="none"
        onPlay={() => setPlayingBefore(true)}
        onPause={() => setPlayingBefore(false)}
        onEnded={() => setPlayingBefore(false)} />
    </div>
  );
}
