import { useRef, useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square, Circle } from "lucide-react";

interface DrumPadProps {
  onAddTrack: (file: File) => void;
  trackCount: number;
}

export type DrumEvent = {
  type: string;
  time: number;
  freq: number;
  dur: number;
};

const KIT_808 = [
  { label: "KICK", color: "#f59e0b", freq: 60, dur: 0.3, type: "kick" },
  { label: "SNARE", color: "#ef4444", freq: 200, dur: 0.15, type: "snare" },
  { label: "CLAP", color: "#ec4899", freq: 300, dur: 0.2, type: "clap" },
  { label: "HIHAT", color: "#06b6d4", freq: 8000, dur: 0.05, type: "hat" },
  { label: "OPEN", color: "#3b82f6", freq: 5000, dur: 0.3, type: "openhat" },
  { label: "TOM", color: "#a855f7", freq: 120, dur: 0.25, type: "tom" },
  { label: "RIM", color: "#22c55e", freq: 400, dur: 0.08, type: "rim" },
  { label: "COWBELL", color: "#f97316", freq: 800, dur: 0.1, type: "cowbell" },
  { label: "KICK 2", color: "#f59e0b", freq: 50, dur: 0.35, type: "kick" },
  { label: "SNARE 2", color: "#ef4444", freq: 180, dur: 0.18, type: "snare" },
  { label: "PERC", color: "#ec4899", freq: 600, dur: 0.1, type: "hat" },
  { label: "CRASH", color: "#06b6d4", freq: 10000, dur: 0.5, type: "openhat" },
  { label: "808", color: "#f59e0b", freq: 40, dur: 0.8, type: "808" },
  { label: "SNAP", color: "#ef4444", freq: 250, dur: 0.06, type: "snap" },
  { label: "SHAKER", color: "#22c55e", freq: 10000, dur: 0.03, type: "hat" },
  { label: "BASS", color: "#a855f7", freq: 80, dur: 0.4, type: "tom" },
] as const;

function getCtx() {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  return new AudioContext({ sampleRate: 44100 });
}

function renderDrum(
  type: string,
  freq: number,
  dur: number,
  sr: number
): Float32Array[] {
  const len = Math.ceil(sr * dur);
  const ch0 = new Float32Array(len);
  const ch1 = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 15);
    let v = 0;
    if (type === "kick" || type === "808") {
      const sweep = freq * (1 + 2 * Math.exp(-t * 30));
      v = Math.sin(2 * Math.PI * sweep * t) * env;
    } else if (type === "snare" || type === "snap" || type === "clap") {
      v = Math.sin(2 * Math.PI * freq * t) * env * 0.3 + (Math.random() * 2 - 1) * env;
    } else if (type === "hat" || type === "openhat") {
      v = (Math.random() * 2 - 1) * env * 0.7;
    } else if (type === "tom") {
      const sweep = freq * (1 + Math.exp(-t * 10));
      v = Math.sin(2 * Math.PI * sweep * t) * env;
    } else {
      v = Math.sin(2 * Math.PI * freq * t) * env;
    }
    ch0[i] = v; ch1[i] = v;
  }
  return [ch0, ch1];
}

function bufToWav(l: Float32Array, r: Float32Array, sr: number): ArrayBuffer {
  const len = l.length * 2 * 2 + 44;
  const buf = new ArrayBuffer(len);
  const v = new DataView(buf);
  let p = 0;
  const u32 = (d: number) => { v.setUint32(p, d, true); p += 4; };
  const u16 = (d: number) => { v.setUint16(p, d, true); p += 2; };
  u32(0x46464952); u32(len - 8); u32(0x45564157);
  u32(0x20746d66); u32(16); u16(1); u16(2);
  u32(sr); u32(sr * 4); u16(4); u16(16);
  u32(0x61746164); u32(l.length * 4);
  for (let i = 0; i < l.length; i++) {
    v.setInt16(p, Math.max(-1, Math.min(1, l[i])) < 0 ? l[i] * 0x8000 : l[i] * 0x7FFF, true);
    p += 2;
    v.setInt16(p, Math.max(-1, Math.min(1, r[i])) < 0 ? r[i] * 0x8000 : r[i] * 0x7FFF, true);
    p += 2;
  }
  return buf;
}

export function DrumPad({ onAddTrack, trackCount }: DrumPadProps) {
  const { toast } = useToast();
  const ctxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recStartRef = useRef<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const eventsRef = useRef<DrumEvent[]>([]);

  const ensureCtx = useCallback(async () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = getCtx();
    }
    const c = ctxRef.current;
    if (c.state === "suspended") await c.resume();
    if (!destRef.current || destRef.current.context !== c) {
      destRef.current = c.createMediaStreamDestination();
      gainRef.current = c.createGain();
      gainRef.current.gain.value = 0.8;
      gainRef.current.connect(destRef.current);
    }
    return { ctx: c, dest: destRef.current, gain: gainRef.current! };
  }, []);

  const play = useCallback(async (index: number) => {
    const pad = KIT_808[index];
    const { ctx, gain } = await ensureCtx();
    const sr = ctx.sampleRate;
    const [ch0, ch1] = renderDrum(pad.type, pad.freq, pad.dur, sr);
    const buf = ctx.createBuffer(2, ch0.length, sr);
    buf.copyToChannel(new Float32Array(ch0), 0);
    buf.copyToChannel(new Float32Array(ch1), 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start();

    // If recording, log the event
    if (recorderRef.current && recorderRef.current.state === "recording") {
      const now = (ctx.currentTime - recStartRef.current) * 1000;
      eventsRef.current.push({ type: pad.type, time: now, freq: pad.freq, dur: pad.dur });
    }
  }, [ensureCtx]);

  const startRecording = useCallback(async () => {
    if (recorderRef.current) return;
    const { ctx, dest } = await ensureCtx();
    const stream = dest.stream;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      recorderRef.current = null;
      setIsRecording(false);
      if (blob.size === 0) return;
      const ext = recorder.mimeType?.includes("wav") ? "wav" : "webm";
      const file = new File([blob], `drum_performance.${ext}`, { type: recorder.mimeType || "audio/webm" });
      onAddTrack(file);
      toast({ title: "Drum performance saved", description: "Added to the mixer as a new track." });
    };
    recorderRef.current = recorder;
    recStartRef.current = ctx.currentTime;
    eventsRef.current = [];
    recorder.start();
    setIsRecording(true);
  }, [ensureCtx, onAddTrack, toast]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const isFull = trackCount >= 8;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-black/20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <div>
          <h2 className="text-lg font-bold">808 Kit</h2>
          <p className="text-[10px] text-muted-foreground">Tap pads to play live. Record your performance to save it as a track.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Tracks: {trackCount}/8</span>
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <Square className="w-3 h-3 fill-current" /> Stop
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={isFull}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                isFull
                  ? "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                  : "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30"
              }`}
            >
              <Circle className="w-3 h-3" /> Record
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-lg mx-auto">
          {KIT_808.map((pad, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-90"
              style={{
                background: `${pad.color}15`,
                border: `1px solid ${pad.color}30`,
              }}
            >
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full" style={{ background: pad.color }} />
              <span className="text-[10px] sm:text-xs font-bold" style={{ color: pad.color }}>
                {pad.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
