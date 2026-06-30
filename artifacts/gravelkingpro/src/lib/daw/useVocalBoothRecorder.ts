import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { audioBufferToWav } from "@/lib/audioKernel";
import { type VocalPreset, buildEffectChain } from "./vocalPresets";

export type BoothRecorderStatus = "idle" | "recording" | "recorded" | "error";

export interface VocalBoothRecorder {
  status: BoothRecorderStatus;
  isRecording: boolean;
  /** Live input level, 0..1 (RMS), for the monitoring meter. */
  level: number;
  /** Captured vocal take (raw MediaRecorder output, usually WebM/Opus). */
  vocalBlob: Blob | null;
  /** Object URL for previewing the vocal take. Revoked on reset/unmount. */
  vocalUrl: string | null;
  errorMsg: string | null;
  /**
   * Begins capture. Must be called from a user gesture (iOS).
   * When `preset` is provided (and not "raw"), the selected effect chain is
   * baked into the recorded take via a MediaStreamAudioDestinationNode.
   * What you hear in the monitor is what ends up in the file.
   */
  start: (deviceId?: string, preset?: VocalPreset) => Promise<boolean>;
  stop: () => void;
  reset: () => void;
  listInputDevices: () => Promise<MediaDeviceInfo[]>;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Decode an arbitrary audio Blob (e.g. WebM/Opus from MediaRecorder) and
 * re-encode it as a 16-bit PCM WAV File. Falls back to the original blob
 * wrapped as a File if the browser can't decode the container.
 */
export async function blobToUploadFile(blob: Blob, baseName: string): Promise<File> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return new File([blob], `${baseName}.webm`, { type: blob.type || "audio/webm" });
  const ctx = new Ctor();
  try {
    const arrayBuf = await blob.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    const wav = audioBufferToWav(audioBuf);
    return new File([wav], `${baseName}.wav`, { type: "audio/wav" });
  } catch {
    // Decode failed — let the server (ffmpeg) handle the original container.
    return new File([blob], `${baseName}.webm`, { type: blob.type || "audio/webm" });
  } finally {
    void ctx.close();
  }
}

/**
 * Minimal microphone recorder for the Vocal Booth. Intentionally standalone
 * (does NOT reuse the multitrack useDAW graph): it only captures the mic, drives
 * a live level meter, and yields a single vocal take. The mic is never routed to
 * the speakers, so backing-track playback can run simultaneously without feedback.
 */
export function useVocalBoothRecorder(): VocalBoothRecorder {
  const { toast } = useToast();

  const [status, setStatus] = useState<BoothRecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const [vocalBlob, setVocalBlob] = useState<Blob | null>(null);
  const [vocalUrl, setVocalUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);

  const stopMeter = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevel(0);
  }, []);

  const teardownAudio = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current) {
      void ctxRef.current.close();
      ctxRef.current = null;
    }
  }, [stopMeter]);

  const runMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Light shaping so quiet singing still reads on the meter.
      setLevel(Math.min(1, rms * 2.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(
    async (deviceId?: string, preset?: VocalPreset): Promise<boolean> => {
      if (recorderRef.current) return false;
      setErrorMsg(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg("This device or browser does not support audio capture.");
        setStatus("error");
        toast({ title: "Recording unavailable", description: "Microphone capture is not supported here.", variant: "destructive" });
        return false;
      }
      if (typeof MediaRecorder === "undefined") {
        setErrorMsg("This browser cannot record audio (MediaRecorder unavailable).");
        setStatus("error");
        toast({ title: "Recording unavailable", description: "Your browser does not support recording.", variant: "destructive" });
        return false;
      }
      // Raw capture (mirrors useDAW): no processing so the carve stays honest.
      const baseAudio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      const openStream = (id?: string) =>
        navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id }, ...baseAudio } : baseAudio });

      try {
        let stream: MediaStream;
        try {
          stream = await openStream(deviceId);
        } catch (e) {
          const name = (e as { name?: string })?.name;
          if (deviceId && (name === "OverconstrainedError" || name === "NotFoundError")) {
            stream = await openStream(undefined);
          } else {
            throw e;
          }
        }
        streamRef.current = stream;
        chunksRef.current = [];

        // Build the AudioContext. When a non-raw preset is active, route the mic
        // through the shared effect chain to a MediaStreamAudioDestinationNode so
        // effects are baked into the recording (what you hear in the monitor is
        // what ends up in the file). The chain never connects to ctx.destination —
        // no speaker feedback from this context; LiveVocalMonitor handles that.
        let recordStream: MediaStream = stream;
        const Ctor = getAudioContextCtor();
        if (Ctor) {
          const ctx = new Ctor();
          if (ctx.state === "suspended") await ctx.resume();
          const src = ctx.createMediaStreamSource(stream);
          if (preset && preset.id !== "raw") {
            const destNode = ctx.createMediaStreamDestination();
            const analyser = buildEffectChain(ctx, src, preset, destNode);
            ctxRef.current = ctx;
            analyserRef.current = analyser;
            runMeter();
            recordStream = destNode.stream;
          } else {
            // Raw path: analyser only — no effects, no speaker output.
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            src.connect(analyser);
            ctxRef.current = ctx;
            analyserRef.current = analyser;
            runMeter();
          }
        }

        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
        const recorder = mime ? new MediaRecorder(recordStream, { mimeType: mime }) : new MediaRecorder(recordStream);
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          chunksRef.current = [];
          recorderRef.current = null;
          teardownAudio();
          const discard = discardRef.current;
          discardRef.current = false;
          if (!mountedRef.current) return; // unmounted — don't create URLs or set state
          if (discard || blob.size === 0) {
            setStatus("idle");
            return;
          }
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setVocalBlob(blob);
          setVocalUrl(url);
          setStatus("recorded");
        };

        recorder.start();
        setStatus("recording");
        return true;
      } catch (e) {
        teardownAudio();
        recorderRef.current = null;
        const name = (e as { name?: string })?.name;
        const denied = name === "NotAllowedError" || name === "SecurityError";
        const msg = denied ? "Allow microphone access in your browser to record." : ((e as { message?: string })?.message ?? "Could not start recording.");
        setErrorMsg(msg);
        setStatus("error");
        toast({ title: denied ? "Microphone blocked" : "Could not start recording", description: msg, variant: "destructive" });
        return false;
      }
    },
    [toast, runMeter, teardownAudio],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const reset = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Abort an in-progress take: discard it and tear down the live mic in onstop.
      discardRef.current = true;
      recorder.stop();
    } else {
      teardownAudio();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setVocalBlob(null);
    setVocalUrl(null);
    setErrorMsg(null);
    setStatus("idle");
  }, [teardownAudio]);

  const listInputDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput");
    } catch {
      return [];
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        // Detach handlers so a late onstop can't create URLs / set state post-unmount.
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state !== "inactive") recorder.stop();
        recorderRef.current = null;
      }
      teardownAudio();
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, [teardownAudio]);

  return {
    status,
    isRecording: status === "recording",
    level,
    vocalBlob,
    vocalUrl,
    errorMsg,
    start,
    stop,
    reset,
    listInputDevices,
  };
}
