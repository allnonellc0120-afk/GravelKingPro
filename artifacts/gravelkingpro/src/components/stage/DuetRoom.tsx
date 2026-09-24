import { useState } from "react";
import { Play, RotateCcw, Save, ShieldCheck, Upload } from "lucide-react";

export type DuetBufferAlignment = {
  localTargetTimeMs: number;
  estimatedTransportMs: number;
  measuredOffsetMs: number;
  residualDriftMs: number | null;
};

/**
 * Convert a host clock target into the receiver's AudioContext clock.
 *
 * `measuredOffsetMs` is the NTP-style clock estimate already calculated by
 * the duet data channel. The receive timestamp is retained for diagnostics:
 * it tells us whether the packet arrived before the scheduled target and makes
 * jitter visible to the smoke harness.
 */
export function alignDuetBufferTarget(
  targetHostTimeMs: number,
  receivedLocalTimeMs: number,
  measuredOffsetMs: number,
  actualClockOffsetMs?: number,
): DuetBufferAlignment {
  const localTargetTimeMs = targetHostTimeMs - measuredOffsetMs;
  const estimatedTransportMs = Math.max(0, receivedLocalTimeMs - localTargetTimeMs);
  const residualDriftMs = actualClockOffsetMs == null
    ? null
    : Math.abs(measuredOffsetMs - actualClockOffsetMs);
  return {
    localTargetTimeMs,
    estimatedTransportMs,
    measuredOffsetMs,
    residualDriftMs,
  };
}

export type Pcm24Bounce = {
  sampleRate: number;
  channelCount: 2;
  interleaved: Int32Array;
  peak: number;
};

export function mergeInterleavedPcm24(
  host: Float32Array,
  guest: Float32Array,
  sampleRate: number,
): Pcm24Bounce {
  if (host.length !== guest.length) throw new Error("Duet channels must have equal frame counts.");
  const interleaved = new Int32Array(host.length * 2);
  let peak = 0;
  for (let frame = 0; frame < host.length; frame += 1) {
    const left = Math.max(-1, Math.min(1, host[frame]!));
    const right = Math.max(-1, Math.min(1, guest[frame]!));
    interleaved[frame * 2] = Math.round(left * 8_388_607);
    interleaved[frame * 2 + 1] = Math.round(right * 8_388_607);
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
  }
  return { sampleRate, channelCount: 2, interleaved, peak };
}

/**
 * Encode independent local vocal + backing buffers into a browser-downloadable
 * stereo WAV. Each caller renders and saves its own copy; no raw take audio is
 * sent through the signaling relay.
 */
export function encodePcm24Wav(channels: Float32Array[], sampleRate: number): Blob {
  if (!channels.length) throw new Error("At least one channel is required.");
  const frameCount = Math.max(...channels.map((channel) => channel.length));
  const channelCount = channels.length;
  const bytesPerSample = 3;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 24, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
      const value = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export type DuetPacket<T = unknown> = {
  sequence: number;
  payload: T;
};

export function recoverJitteredPackets<T>(packets: DuetPacket<T>[]): DuetPacket<T>[] {
  return [...packets].sort((left, right) => left.sequence - right.sequence);
}

type DuetReviewCardProps = {
  trackName: string;
  durationSec: number;
  saving?: boolean;
  onPlayReview: () => void;
  onDownloadTake: () => void;
  onSaveToVault: () => void;
  onRetake: () => void;
  auditionDisabled?: boolean;
  contestArtistName?: string;
  onContestArtistNameChange?: (value: string) => void;
  featureConsent?: boolean;
  onFeatureConsentChange?: (value: boolean) => void;
  outreachConsent?: boolean;
  onOutreachConsentChange?: (value: boolean) => void;
  contestSubmitting?: boolean;
  contestMessage?: string | null;
  onSubmitContest?: () => void;
};

export function DuetReviewCard({
  trackName,
  durationSec,
  saving = false,
  onPlayReview,
  onDownloadTake,
  onSaveToVault,
  onRetake,
  auditionDisabled = false,
  contestArtistName = "",
  onContestArtistNameChange = () => {},
  featureConsent = false,
  onFeatureConsentChange = () => {},
  outreachConsent = false,
  onOutreachConsentChange = () => {},
  contestSubmitting = false,
  contestMessage,
  onSubmitContest,
}: DuetReviewCardProps) {
  return (
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-amber-300/30 bg-[#111218]/98 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.75)]" aria-label="Post-performance take">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Performance captured</p>
            <h2 className="mt-1 text-xl font-black text-white">Your take is ready</h2>
            <p className="mt-1 text-xs text-white/50">{trackName || "Untitled backing"} · {Math.round(durationSec)} seconds</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRetake} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:border-white/30 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />Retake</button>
            <button type="button" disabled={auditionDisabled} onClick={onPlayReview} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/35 bg-violet-300/10 px-3 py-2 text-xs text-violet-100 hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:opacity-40" title={auditionDisabled ? "The user who queued the active song controls its first audition." : undefined}><Play className="h-3.5 w-3.5" />▶ Quick Audition</button>
            <button type="button" onClick={onDownloadTake} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/35 bg-sky-300/10 px-3 py-2 text-xs text-sky-100 hover:bg-sky-300/20"><Save className="h-3.5 w-3.5" />💾 Download Take</button>
            <button type="button" disabled={saving} onClick={onSaveToVault} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"><Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "💾 Save Take to Library"}</button>
          </div>
        </div>
        {auditionDisabled && (
          <p className="mt-3 rounded-lg border border-violet-300/15 bg-violet-300/[0.06] px-3 py-2 text-xs text-violet-100/70">
            Initial audition control belongs to the performer who queued this song.
          </p>
        )}
        {onSubmitContest && <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-bold text-white">Enter the Featured Artist Contest</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                We will master this complete Main Stage performance, embed its GravelKing IP seal, and submit the server-recorded job for owner review.
              </p>
            </div>
          </div>
          <label className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-white/50">
            Artist name
            <input
              value={contestArtistName}
              onChange={(event) => onContestArtistNameChange(event.target.value)}
              maxLength={255}
              placeholder="Name shown if selected"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-amber-300/50"
            />
          </label>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">
            <input type="checkbox" checked={featureConsent} onChange={(event) => onFeatureConsentChange(event.target.checked)} className="mt-0.5" />
            <span>I consent to GravelKing Productions reviewing this performance and publicly featuring it if selected.</span>
          </label>
          <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">
            <input type="checkbox" checked={outreachConsent} onChange={(event) => onOutreachConsentChange(event.target.checked)} className="mt-0.5" />
            <span>Optional: I consent to approved private catalog outreach for future major-label or movie-sync consideration. Selection is not guaranteed.</span>
          </label>
          <button
            type="button"
            disabled={contestSubmitting || auditionDisabled || !contestArtistName.trim() || !featureConsent}
            onClick={onSubmitContest}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-bold text-zinc-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Upload className="h-4 w-4" />
            {contestSubmitting ? "Sealing and submitting…" : "Seal & Submit Audition"}
          </button>
          {contestMessage && <p className="mt-2 text-xs leading-relaxed text-amber-100/75" role="status">{contestMessage}</p>}
        </div>}
      </section>
  );
}

export default DuetReviewCard;