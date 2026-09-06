import { useEffect, useRef, useState } from "react";

interface TrackMeterProps {
  /** Returns the live AnalyserNode for this track, or null when not playing. */
  getAnalyser: () => AnalyserNode | null;
  active: boolean;
  color?: string;
}

/**
 * Live per-stem level meter. Reads RMS + peak from the track's AnalyserNode and
 * renders a vertical bar plus a numeric dBFS readout. Falls back to silence when
 * the track is not playing.
 */
export function TrackMeter({ getAnalyser, active, color = "#22c55e" }: TrackMeterProps) {
  const rafRef = useRef<number>(0);
  const peakHoldRef = useRef<number>(-100);
  const [rmsDb, setRmsDb] = useState(-100);
  const [peakDb, setPeakDb] = useState(-100);

  useEffect(() => {
    if (!active) {
      setRmsDb(-100);
      setPeakDb(-100);
      peakHoldRef.current = -100;
      return;
    }
    const buf = new Float32Array(256);
    const tick = () => {
      const analyser = getAnalyser();
      if (analyser) {
        analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          sumSq += v * v;
          const a = Math.abs(v);
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        const toDb = (x: number) => (x > 0.00001 ? 20 * Math.log10(x) : -100);
        const rDb = toDb(rms);
        const pDb = toDb(peak);
        peakHoldRef.current = Math.max(peakHoldRef.current - 0.5, pDb);
        setRmsDb(rDb);
        setPeakDb(peakHoldRef.current);
      } else {
        setRmsDb(-100);
        setPeakDb(-100);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, getAnalyser]);

  // Map -60..0 dB → 0..100% height.
  const pct = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  const rmsPct = pct(rmsDb);
  const peakPct = pct(peakDb);
  const clip = peakDb > -0.5;

  return (
    <div className="flex flex-col items-center gap-0.5 w-full">
      <div className="relative w-2.5 h-16 rounded-full bg-black/50 border border-border/20 overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-[height] duration-75"
          style={{
            height: `${rmsPct}%`,
            background: clip
              ? "linear-gradient(to top,#22c55e,#eab308 70%,#ef4444)"
              : `linear-gradient(to top, ${color}, #eab308 85%)`,
          }}
        />
        {/* Peak-hold marker */}
        {peakPct > 1 && (
          <div
            className="absolute left-0 right-0 h-0.5"
            style={{ bottom: `${peakPct}%`, background: clip ? "#ef4444" : "#e2e8f0" }}
          />
        )}
      </div>
      <span className="text-[8px] font-mono" style={{ color: clip ? "#ef4444" : "rgba(255,255,255,0.5)" }}>
        {peakDb <= -100 ? "—" : `${peakDb.toFixed(0)}`}
      </span>
    </div>
  );
}
