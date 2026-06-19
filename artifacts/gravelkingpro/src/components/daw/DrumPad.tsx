import { useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface DrumPadProps {
  onAddTrack: (file: File) => void;
  disabled?: boolean;
  trackCount: number;
}

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

function ctx() {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  return new AudioContext({ sampleRate: 44100 });
}

function renderDrum(
  type: string,
  freq: number,
  dur: number
): AudioBuffer {
  const c = ctx();
  const sr = c.sampleRate;
  const len = Math.ceil(sr * dur);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 15);
      if (type === "kick" || type === "808") {
        // Pitch sweep for kick
        const sweep = freq * (1 + 2 * Math.exp(-t * 30));
        d[i] = Math.sin(2 * Math.PI * sweep * t) * env;
      } else if (type === "snare" || type === "snap" || type === "clap") {
        // Noise + tone
        const tone = Math.sin(2 * Math.PI * freq * t) * env * 0.3;
        const noise = (Math.random() * 2 - 1) * env;
        d[i] = tone + noise;
      } else if (type === "hat" || type === "openhat") {
        // High-pass noise
        d[i] = (Math.random() * 2 - 1) * env * 0.7;
      } else if (type === "tom") {
        const sweep = freq * (1 + Math.exp(-t * 10));
        d[i] = Math.sin(2 * Math.PI * sweep * t) * env;
      } else if (type === "cowbell" || type === "rim") {
        d[i] = Math.sin(2 * Math.PI * freq * t) * env;
      } else {
        d[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    }
  }
  return buf;
}

function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numOfChan = buf.numberOfChannels;
  const length = buf.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  // write WAV header
  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buf.sampleRate);
  setUint32(buf.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buf.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return buffer;
}

export function DrumPad({ onAddTrack, disabled, trackCount }: DrumPadProps) {
  const { toast } = useToast();
  const ctxRef = useRef<AudioContext | null>(null);

  const play = useCallback(
    async (index: number) => {
      if (disabled) {
        toast({ title: "Track limit reached", description: "Maximum 8 tracks", variant: "destructive" });
        return;
      }
      const pad = KIT_808[index];
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = ctx();
      }
      const c = ctxRef.current;
      if (c.state === "suspended") await c.resume();

      const buf = renderDrum(pad.type, pad.freq, pad.dur);
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      gain.gain.value = 0.8;
      src.connect(gain);
      gain.connect(c.destination);
      src.start();

      // Record to a new track
      const wav = bufferToWav(buf);
      const file = new File([wav], `${pad.label.toLowerCase().replace(/\s+/g, "_")}_pad.wav`, {
        type: "audio/wav",
      });
      onAddTrack(file);
    },
    [disabled, onAddTrack, toast]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-black/20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <div>
          <h2 className="text-lg font-bold">808 Kit</h2>
          <p className="text-[10px] text-muted-foreground">Tap pads to play and record to track {trackCount}/8</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-lg mx-auto">
          {KIT_808.map((pad, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              disabled={disabled}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-90 ${
                disabled ? "opacity-30 cursor-not-allowed" : ""
              }`}
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
