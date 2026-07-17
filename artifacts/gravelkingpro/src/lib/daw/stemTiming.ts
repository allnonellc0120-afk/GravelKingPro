// Vocal Booth — energy-based karaoke lyric timing.
//
// Honesty note: the line timing here is ENERGY-BASED and APPROXIMATE. We do NOT
// transcribe the audio or run forced alignment — we detect where the guide vocal
// is loud (singing) vs quiet, then distribute the lyric lines across those voiced
// regions. Treat every timestamp as a best-effort guide, not a word-accurate sync.

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** A lyric line (by its index in the full lyrics) and its approximate start time (seconds). */
export interface TimedLine {
  idx: number;
  t: number;
}

interface VoicedSegment {
  start: number;
  end: number;
}

/** Lines worth timing: non-empty and not a [Section] marker. */
function singableLineIndices(lyricLines: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < lyricLines.length; i++) {
    const t = lyricLines[i].trim();
    if (t.length > 0 && !t.startsWith("[")) out.push(i);
  }
  return out;
}

/**
 * Detect voiced (singing) regions via short-time RMS energy with hysteresis.
 * ~50ms hops, relative thresholds, with small-gap merging and min-length pruning.
 */
function computeVoicedSegments(buf: AudioBuffer): VoicedSegment[] {
  const sr = buf.sampleRate;
  const length = buf.length;
  if (length === 0) return [];

  const mono = new Float32Array(length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  if (buf.numberOfChannels > 1) {
    for (let i = 0; i < length; i++) mono[i] /= buf.numberOfChannels;
  }

  const hop = Math.max(1, Math.floor(sr * 0.05));
  const frames: number[] = [];
  let maxRms = 0;
  for (let start = 0; start < length; start += hop) {
    const end = Math.min(length, start + hop);
    let sum = 0;
    for (let i = start; i < end; i++) sum += mono[i] * mono[i];
    const rms = Math.sqrt(sum / (end - start));
    frames.push(rms);
    if (rms > maxRms) maxRms = rms;
  }
  if (maxRms <= 1e-6) return [];

  const enter = maxRms * 0.16;
  const exit  = maxRms * 0.08;
  const frameDur = hop / sr;

  const segments: VoicedSegment[] = [];
  let voiced = false;
  let segStart = 0;
  for (let f = 0; f < frames.length; f++) {
    const t = f * frameDur;
    if (!voiced && frames[f] >= enter) { voiced = true; segStart = t; }
    else if (voiced && frames[f] < exit) { voiced = false; segments.push({ start: segStart, end: t }); }
  }
  if (voiced) segments.push({ start: segStart, end: frames.length * frameDur });

  const merged: VoicedSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < 0.25) last.end = s.end;
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.end - s.start >= 0.15);
}

function distribute(singable: number[], segments: VoicedSegment[], duration: number): TimedLine[] {
  const n = singable.length;
  if (n === 0) return [];
  if (segments.length === 0 || duration <= 0) {
    return singable.map((idx, k) => ({ idx, t: (k / n) * Math.max(duration, 1) }));
  }
  const voicedStart = segments[0].start;
  const voicedEnd   = segments[segments.length - 1].end;
  const span = Math.max(0.001, voicedEnd - voicedStart);
  const onsets = segments.map((s) => s.start);
  if (onsets.length >= n && n > 1) {
    return singable.map((idx, k) => {
      const oi = Math.round((k * (onsets.length - 1)) / (n - 1));
      return { idx, t: onsets[Math.min(onsets.length - 1, oi)] };
    });
  }
  return singable.map((idx, k) => ({ idx, t: voicedStart + (k / n) * span }));
}

/**
 * Energy-based, approximate timing. Decodes the guide-vocal blob, finds voiced
 * regions, and assigns each singable lyric line a start time. Returns null when
 * there is nothing to time or decoding is unavailable.
 */
export async function analyzeGuideTiming(vocalsBlob: Blob, lyricLines: string[]): Promise<TimedLine[] | null> {
  const singable = singableLineIndices(lyricLines);
  if (singable.length === 0) return null;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  const ctx = new Ctor();
  try {
    const audioBuf = await ctx.decodeAudioData(await vocalsBlob.arrayBuffer());
    const segments = computeVoicedSegments(audioBuf);
    const timed = distribute(singable, segments, audioBuf.duration);
    return timed.length ? timed : null;
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}
