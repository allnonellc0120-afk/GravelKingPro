// Vocal Booth — "split your own song" + energy-based karaoke timing.
//
// Honesty note: the line timing here is ENERGY-BASED and APPROXIMATE. We do NOT
// transcribe the audio or run forced alignment — we detect where the extracted
// guide vocal is loud (singing) vs quiet, then distribute the lyric lines across
// those voiced regions. Treat every timestamp as a best-effort guide, not a
// word-accurate sync. The stem split itself (MLK v3 band/spatial separation) is
// also approximate and bleeds, so the guide vocal is a reference, not a clean a-cappella.

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class SplitError extends Error {
  /** True when the failure is an entitlement/paywall response (HTTP 402/403). */
  paywall: boolean;
  code?: string;
  constructor(message: string, opts?: { paywall?: boolean; code?: string }) {
    super(message);
    this.name = "SplitError";
    this.paywall = opts?.paywall ?? false;
    this.code = opts?.code;
  }
}

export interface SplitResult {
  /** Full mix with vocals removed — becomes the karaoke backing track. */
  instrumental: Blob;
  /** Isolated (approximate) vocal stem — used as the optional guide vocal. */
  vocals: Blob;
}

/**
 * Split a full song into stems on the server and return the instrumental +
 * vocal blobs. Uses the Studio stem-split path, which requires a Pro
 * subscription (the page is already Pro-gated, so entitled users pass).
 */
export async function splitSong(file: File): Promise<SplitResult> {
  const form = new FormData();
  form.append("audio", file, file.name);
  form.append("mode", "stem_split");
  form.append("source", "studio");
  form.append("multiplier", "0.75");
  form.append("stemsOnly", "primary"); // only vocals + instrumental — prevents iOS OOM on large ZIPs

  // 3-minute timeout — Replicate can take 90s+ on large files
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000);

  let resp: Response;
  try {
    resp = await fetch("/api/kernel/process-audio", {
      method: "POST",
      credentials: "include",
      body: form,
      signal: controller.signal,
    });
  } catch (fetchErr: unknown) {
    clearTimeout(timeoutId);
    const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
    throw new SplitError(
      isAbort
        ? "Split timed out — the song may be too long. Try a shorter clip (under 5 minutes)."
        : "Network error while splitting. Check your connection and try again.",
    );
  }
  clearTimeout(timeoutId);

  if (resp.status === 402 || resp.status === 403) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new SplitError(data.error ?? "Splitting a song requires a GravelKing Pro subscription.", {
      paywall: true,
      code: data.code,
    });
  }
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new SplitError(
      data.error ?? `Split failed (server error ${resp.status}). Try a shorter file or try again in a moment.`,
    );
  }

  const zipBlob = await resp.blob();
  const { unzip } = await import("fflate");
  const bytes = new Uint8Array(await zipBlob.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (err: Error | null, f: Record<string, Uint8Array>) => (err ? reject(err) : resolve(f)));
  });

  const instr = files["GKP_instrumental.wav"];
  const voc = files["GKP_vocals.wav"];
  if (!instr || !voc) {
    throw new SplitError("The server response was missing the instrumental or vocal stem.");
  }
  return {
    instrumental: new Blob([instr as BlobPart], { type: "audio/wav" }),
    vocals: new Blob([voc as BlobPart], { type: "audio/wav" }),
  };
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

  // Mix to mono.
  const mono = new Float32Array(length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  if (buf.numberOfChannels > 1) {
    for (let i = 0; i < length; i++) mono[i] /= buf.numberOfChannels;
  }

  const hop = Math.max(1, Math.floor(sr * 0.05)); // ~50ms frames
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

  // Hysteresis thresholds, relative to the loudest frame.
  const enter = maxRms * 0.16;
  const exit = maxRms * 0.08;
  const frameDur = hop / sr;

  const segments: VoicedSegment[] = [];
  let voiced = false;
  let segStart = 0;
  for (let f = 0; f < frames.length; f++) {
    const t = f * frameDur;
    if (!voiced && frames[f] >= enter) {
      voiced = true;
      segStart = t;
    } else if (voiced && frames[f] < exit) {
      voiced = false;
      segments.push({ start: segStart, end: t });
    }
  }
  if (voiced) segments.push({ start: segStart, end: frames.length * frameDur });

  // Merge gaps shorter than 250ms.
  const merged: VoicedSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < 0.25) last.end = s.end;
    else merged.push({ ...s });
  }
  // Drop very short blips (< 150ms).
  return merged.filter((s) => s.end - s.start >= 0.15);
}

/** Spread singable line indices across detected onsets / voiced span. */
function distribute(singable: number[], segments: VoicedSegment[], duration: number): TimedLine[] {
  const n = singable.length;
  if (n === 0) return [];

  // No usable energy info → even linear spread across the whole track.
  if (segments.length === 0 || duration <= 0) {
    return singable.map((idx, k) => ({ idx, t: (k / n) * Math.max(duration, 1) }));
  }

  const voicedStart = segments[0].start;
  const voicedEnd = segments[segments.length - 1].end;
  const span = Math.max(0.001, voicedEnd - voicedStart);

  // Enough distinct onsets to anchor each line → snap lines to onset times.
  const onsets = segments.map((s) => s.start);
  if (onsets.length >= n && n > 1) {
    return singable.map((idx, k) => {
      const oi = Math.round((k * (onsets.length - 1)) / (n - 1));
      return { idx, t: onsets[Math.min(onsets.length - 1, oi)] };
    });
  }

  // Otherwise distribute evenly across the voiced span.
  return singable.map((idx, k) => ({ idx, t: voicedStart + (k / n) * span }));
}

/**
 * Energy-based, approximate timing. Decodes the guide-vocal blob, finds voiced
 * regions, and assigns each singable lyric line a start time. Returns null when
 * there is nothing to time or decoding is unavailable (caller should then fall
 * back to plain linear teleprompter scroll).
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
