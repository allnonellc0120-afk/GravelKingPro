/**
 * Main Stage — Karaoke performance surface with live mic monitoring.
 *
 * Layout:
 *   – Full-screen local performer: rolling lyrics prompter + transport at full width
 *   – Floating partner HUD: audio-reactive corner bubble when a duet peer connects
 *   – FX rack overlay panel (right-side drawer, opens when monitor starts)
 *   – Global bottom nav is suppressed by Navigation.tsx on this route
 *
 * Audio graph (direct sidetone, no inserted delay):
 *   mic → gainNode → ctx.destination          (dry, latencyHint: interactive)
 *   gainNode → analyser                        (meter tap, parallel)
 *   gainNode → hpFilter → warmthFilter → reverbSend → convolver → reverbWet → ctx.destination
 *
 * Duet signaling: same in-memory SSE relay as /duet, reused under a GK-STAGE-XXXX room code.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { LivePerformanceStage } from "@/components/live-performance-stage";
import { DuetReviewCard, encodePcm24Wav } from "@/components/stage/DuetRoom";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@clerk/react";
import {
  decodeStageCatalogAudio,
  listStageCatalogEntries,
  saveStageCatalogEntry,
  stageCatalogLinesToPrompterLines,
  type StageCatalogEntry,
} from "@/lib/stage-catalog";
import { downloadBlob } from "@/lib/download";
import { Check, Copy, FolderOpen, Headphones, ListMusic, Mic, MicOff, Share2, SkipForward, Square, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { useLocation } from "wouter";

type StageQueueItem = {
  id: string;
  trackId: string;
  title: string;
  durationSeconds: number | null;
  hasSyncedLyrics: boolean;
  queuedByPeerId: string;
  queuedByRole: "host" | "partner";
  serverTimestamp: number;
};

type StageQueueSnapshot = {
  nowPlaying: StageQueueItem | null;
  upNext: StageQueueItem[];
};

type DuetHandshakeState = "idle" | "joining" | "waiting" | "connecting" | "connected";
const DUET_HANDSHAKE_TIMEOUT_MS = 45_000;

// ─── Audio graph types & builder ─────────────────────────────────────────────

interface MonitorGraph {
  ctx:          AudioContext;
  stream:       MediaStream;
  source:       MediaStreamAudioSourceNode;
  gainNode:     GainNode;
  hpFilter:     BiquadFilterNode;
  warmthFilter: BiquadFilterNode;
  reverbSend:   GainNode;
  convolver:    ConvolverNode;
  reverbWet:    GainNode;
  analyser:     AnalyserNode;
}

function buildIR(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2.2);
  const pre = Math.floor(ctx.sampleRate * 0.018);
  const ir  = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const pos  = i - pre;
      const tail = len - pre;
      const n    = (Math.random() + Math.random() + Math.random()) / 3 * 2 - 1;
      d[i] = n * Math.pow(1 - pos / tail, 2.2);
    }
  }
  return ir;
}

function buildMonitorGraph(
  stream: MediaStream,
  micGain: number,
  hpfOn: boolean,
  warmth: number,
  reverbSend: number,
): MonitorGraph {
    const ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });

  const source              = ctx.createMediaStreamSource(stream);
  const gainNode            = ctx.createGain();
  gainNode.gain.value       = micGain;

  const hpFilter                = ctx.createBiquadFilter();
  hpFilter.type                 = "highpass";
  hpFilter.frequency.value      = hpfOn ? 80 : 20;
  hpFilter.Q.value              = 0.707;

  const warmthFilter            = ctx.createBiquadFilter();
  warmthFilter.type             = "lowshelf";
  warmthFilter.frequency.value  = 250;
  warmthFilter.gain.value       = warmth;

  const analyser        = ctx.createAnalyser();
  analyser.fftSize      = 1024;
  analyser.smoothingTimeConstant = 0.72;

  const reverbSendNode       = ctx.createGain();
  reverbSendNode.gain.value  = reverbSend;
  const convolver            = ctx.createConvolver();
  convolver.buffer           = buildIR(ctx);
  const reverbWet            = ctx.createGain();
  reverbWet.gain.value       = 1;

  // Dry path: direct sidetone with no inserted delay nodes
  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Parallel meter tap — does not delay the dry path
  gainNode.connect(analyser);

  // Reverb aux bus (optional ambience)
  gainNode.connect(hpFilter);
  hpFilter.connect(warmthFilter);
  warmthFilter.connect(reverbSendNode);
  reverbSendNode.connect(convolver);
  convolver.connect(reverbWet);
  reverbWet.connect(ctx.destination);

  return { ctx, stream, source, gainNode, hpFilter, warmthFilter, reverbSend: reverbSendNode, convolver, reverbWet, analyser };
}

// ─── Monitor settings ────────────────────────────────────────────────────────

const MONITOR_SETTINGS_KEY = "gk:main-stage:monitor:v1";

interface MonitorSettings {
  micGain:    number;
  hpfOn:      boolean;
  warmth:     number;
  reverbSend: number;
}

function loadMonitorSettings(): MonitorSettings {
  try {
    const raw = localStorage.getItem(MONITOR_SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<MonitorSettings>;
      return {
        micGain:    typeof p.micGain    === "number" ? Math.max(0, Math.min(2, p.micGain))    : 1,
        hpfOn:      p.hpfOn !== false,
        warmth:     typeof p.warmth     === "number" ? Math.max(-3, Math.min(6, p.warmth))    : 0,
        reverbSend: typeof p.reverbSend === "number" ? Math.max(0, Math.min(1, p.reverbSend)) : 0.15,
      };
    }
  } catch { /* storage blocked */ }
  return { micGain: 1, hpfOn: true, warmth: 0, reverbSend: 0.15 };
}

// ─── Duet signaling types ────────────────────────────────────────────────────

type SignalType = "offer" | "answer" | "ice";

interface ArtistProfile {
  artistName: string;
  hometown:   string;
  avatarUrl:  string | null;
}

function isSignalType(v: unknown): v is SignalType {
  return v === "offer" || v === "answer" || v === "ice";
}

function newStageRoomCode(): string {
  return `GK-STAGE-${crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function joinUrlFromCode(code: string): string {
  const basePath = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${window.location.origin}${basePath}stage/duet/${encodeURIComponent(code)}`;
}

// ─── Partner floating HUD ────────────────────────────────────────────────────

interface PartnerHudProps {
  profile:        ArtistProfile | null;
  partnerLevel:   number;           // 0–1 RMS from remote analyser
  volume:         number;           // 0–1 slider
  onVolumeChange: (v: number) => void;
  onDismissInvite: () => void;
  showInvite:     boolean;
  inviteCode:     string;
  onOpenInvite:   () => void;
  connected:      boolean;
  handshakeState: DuetHandshakeState;
  onCancelHandshake: () => void;
}

function PartnerHud({
  profile, partnerLevel, volume, onVolumeChange,
  showInvite, inviteCode, onOpenInvite, onDismissInvite, connected,
  handshakeState, onCancelHandshake,
}: PartnerHudProps) {
  const [volOpen,    setVolOpen]    = useState(false);
  const [copied,     setCopied]     = useState(false);
  const joinUrl = joinUrlFromCode(inviteCode);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const shareLink = async () => {
    try {
      await navigator.share({ title: "Join my GravelKing Duet Stage", url: joinUrl });
    } catch { /* share declined */ }
  };

  // Glow intensity driven by remote audio level
  const glowAlpha  = (0.18 + partnerLevel * 0.72).toFixed(3);
  const glowBlur   = `${10 + Math.round(partnerLevel * 22)}px`;
  const ringScale  = 1 + partnerLevel * 0.18;

  return (
    <>
      {/* ── Floating partner bubble — top-right corner ── */}
      <div className="fixed right-4 top-20 z-[55] flex flex-col items-end gap-2 sm:right-6 sm:top-20">
        {connected ? (
          /* Connected partner avatar with audio-reactive glow */
          <button
            type="button"
            onClick={() => setVolOpen(v => !v)}
            aria-label="Toggle partner volume"
            style={{
              boxShadow: `0 0 ${glowBlur} hsl(267 84% 70% / ${glowAlpha}), 0 0 ${glowBlur} hsl(267 84% 70% / ${(Number(glowAlpha) * 0.5).toFixed(3)})`,
              transform: `scale(${ringScale.toFixed(3)})`,
              transition: "transform 80ms linear, box-shadow 80ms linear",
            }}
            className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-violet-400/70 bg-gradient-to-br from-violet-900/80 to-zinc-900 sm:h-16 sm:w-16"
          >
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.artistName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-black text-violet-200">
                {profile?.artistName?.[0]?.toUpperCase() ?? <UserRound className="h-6 w-6" />}
              </span>
            )}
            {/* Live voice indicator */}
            {partnerLevel > 0.04 && (
              <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.9)]" />
            )}
          </button>
        ) : (
          /* No partner yet — glowing invite button */
          <button
            type="button"
            onClick={onOpenInvite}
            className="flex h-14 w-14 flex-col items-center justify-center rounded-full border border-dashed border-violet-400/55 bg-violet-500/10 text-violet-300 shadow-[0_0_18px_hsl(267_84%_70%/0.22)] transition-all hover:border-violet-400/90 hover:bg-violet-500/18 hover:shadow-[0_0_26px_hsl(267_84%_70%/0.38)] sm:h-16 sm:w-16"
            aria-label="Invite duet partner"
          >
            <span className="text-xl font-black leading-none">+</span>
            <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide leading-none">Invite</span>
          </button>
        )}

        {/* Partner name tag */}
        <div className="text-right">
          <p className="text-[10px] font-bold text-violet-300/90">
            {connected ? (profile?.artistName ?? "Partner") : "No partner"}
          </p>
          {connected && (
            <p className="text-[9px] uppercase tracking-wide text-white/40">Live ·duet</p>
          )}
        </div>

        {/* Volume popover */}
        {volOpen && connected && (
          <div className="w-40 rounded-2xl border border-white/10 bg-zinc-950/96 p-3 shadow-[0_4px_32px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Partner vol</span>
              <button
                type="button"
                onClick={() => setVolOpen(false)}
                className="rounded p-0.5 text-white/40 hover:text-white"
                aria-label="Close volume panel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <Slider
              min={0} max={1} step={0.01}
              value={[volume]}
              onValueChange={([v]) => { if (v !== undefined) onVolumeChange(v); }}
              aria-label="Partner monitor volume"
            />
            <p className="mt-1 text-right font-mono text-[9px] text-violet-300/70">{Math.round(volume * 100)} %</p>
          </div>
        )}
      </div>

      {/* ── Invite card modal ── */}
      {(showInvite || (handshakeState !== "idle" && handshakeState !== "connected")) && handshakeState !== "connected" && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Invite duet partner"
        >
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950/98 p-6 shadow-[0_8px_56px_rgba(0,0,0,0.75)]">
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">Duet Stage</p>
                <h2 className="mt-0.5 text-lg font-black text-white">Invite a Partner</h2>
              </div>
              <button
                type="button"
                onClick={onDismissInvite}
                className="rounded-full p-1.5 text-white/40 hover:bg-white/8 hover:text-white"
                aria-label="Close invite panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Room code */}
            <div className="mb-4 rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-center">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-violet-400/80">Stage Room Code</p>
              <p className="font-mono text-2xl font-black tracking-widest text-violet-200">{inviteCode}</p>
            </div>

            {/* Copy link */}
            <button
              type="button"
              onClick={copyLink}
              className={[
                "mb-3 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-[11px] font-bold uppercase tracking-wider transition-all",
                copied
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                  : "border-violet-400/40 bg-violet-500/12 text-violet-200 hover:border-violet-400/70 hover:bg-violet-500/20",
              ].join(" ")}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Invite Link"}
            </button>

            {/* Native share */}
            {"share" in navigator && (
              <button
                type="button"
                onClick={shareLink}
                className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 py-3 text-[11px] font-bold uppercase tracking-wider text-white/60 transition-all hover:border-white/25 hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share via…
              </button>
            )}

            {/* Connection state and manual override */}
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
              <p className="text-[10px] font-medium text-white/50">
                {handshakeState === "joining" ? "Sharing link…" : handshakeState === "connecting" ? "Connecting to partner…" : "Waiting for partner…"}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelHandshake}
              className="mt-4 min-h-11 w-full rounded-xl border border-white/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              Cancel / Back to Solo
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Stage page ──────────────────────────────────────────────────────────

export default function MainStage() {
  const { getToken } = useAuth();

  // ── Monitor state ──────────────────────────────────────────────────────────
  const [monitorOn, setMonitorOn] = useState(false);
  const [fxOpen,    setFxOpen]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [level,     setLevel]     = useState(0);
  const [settings,  setSettings]  = useState<MonitorSettings>(loadMonitorSettings);
  const [bluetoothOutput, setBluetoothOutput] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [trackName, setTrackName] = useState("");
  const [, setLocation] = useLocation();
  const [stageLyrics, setStageLyrics] = useState<ReturnType<typeof stageCatalogLinesToPrompterLines>>([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultEntries, setVaultEntries] = useState<StageCatalogEntry[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  interface LibraryTrack { id: string; title: string; artistName?: string; createdAt?: string; }
  const [serverTracks, setServerTracks] = useState<LibraryTrack[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [takeBlob, setTakeBlob] = useState<Blob | null>(null);
  const [savingTake, setSavingTake] = useState(false);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [takeSavedMessage, setTakeSavedMessage] = useState<string | null>(null);
  const [contestArtistName, setContestArtistName] = useState("");
  const [featureConsent, setFeatureConsent] = useState(false);
  const [outreachConsent, setOutreachConsent] = useState(false);
  const [contestSubmitting, setContestSubmitting] = useState(false);
  const [contestMessage, setContestMessage] = useState<string | null>(null);

  const graphRef  = useRef<MonitorGraph | null>(null);
  const rafRef    = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const backingBufferRef = useRef<AudioBuffer | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackGainRef = useRef<GainNode | null>(null);
  const playbackStartContextRef = useRef<number | null>(null);
  const playbackOffsetRef = useRef(0);
  const playbackRafRef = useRef<number>(0);
  const takeRecorderRef = useRef<MediaRecorder | null>(null);
  const takeChunksRef = useRef<Blob[]>([]);
  const savedTakeRef = useRef<Blob | null>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Duet state ────────────────────────────────────────────────────────────
  const [inviteCode,      setInviteCode]      = useState(newStageRoomCode);
  const [showInvite,      setShowInvite]      = useState(false);
  const [handshakeState,  setHandshakeState]  = useState<DuetHandshakeState>("idle");
  const [peerConnected,   setPeerConnected]   = useState(false);
  const [partnerProfile,  setPartnerProfile]  = useState<ArtistProfile | null>(null);
  const [partnerLevel,    setPartnerLevel]    = useState(0);
  const [partnerVolume,   setPartnerVolume]   = useState(0.8);
  const [roomRole, setRoomRole] = useState<"host" | "partner" | null>(null);
  const [stageQueue, setStageQueue] = useState<StageQueueSnapshot>({ nowPlaying: null, upNext: [] });
  const [queueBusy, setQueueBusy] = useState(false);

  const peerIdRef            = useRef(crypto.randomUUID());
  const remotePeerRef        = useRef<string | null>(null);
  const roleRef              = useRef<"host" | "partner" | null>(null);
  const sseRef               = useRef<EventSource | null>(null);
  const pcRef                = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const partnerAnalyserRef   = useRef<AnalyserNode | null>(null);
  const partnerGainRef       = useRef<GainNode | null>(null);
  const partnerAudioCtxRef   = useRef<AudioContext | null>(null);
  const partnerSinkRef       = useRef<HTMLAudioElement | null>(null);
  const partnerSourceRef     = useRef<MediaStreamAudioSourceNode | null>(null);
  // Published through state (not only a ref) so the partner riser re-renders with a live analyser.
  const [partnerAnalyser, setPartnerAnalyser] = useState<AnalyserNode | null>(null);
  const partnerRafRef        = useRef<number>(0);
  const peerMicStreamRef     = useRef<MediaStream | null>(null);
  const dataChannelRef       = useRef<RTCDataChannel | null>(null);
  const roomCodeRef          = useRef(inviteCode);
  const activeQueueItemRef   = useRef<string | null>(null);
  const handshakeTimerRef    = useRef<number | null>(null);
  const handshakeAttemptRef  = useRef(0);
  const joinAbortRef         = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!takeBlob) {
      setReviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(takeBlob);
    setReviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [takeBlob]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const clearHandshakeWatchdog = useCallback(() => {
    if (handshakeTimerRef.current !== null) {
      window.clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = null;
    }
  }, []);

  // Idempotent teardown of the partner audio graph (reconnects, peer-left, unmount).
  const detachPartnerStream = useCallback(() => {
    cancelAnimationFrame(partnerRafRef.current);
    try { partnerSourceRef.current?.disconnect(); } catch { /* already detached */ }
    try { partnerGainRef.current?.disconnect(); } catch { /* already detached */ }
    partnerSourceRef.current = null;
    partnerGainRef.current = null;
    partnerAnalyserRef.current = null;
    if (partnerSinkRef.current) {
      partnerSinkRef.current.pause();
      partnerSinkRef.current.srcObject = null;
    }
    setPartnerAnalyser(null);
    setPartnerLevel(0);
  }, []);

  const abortDuetHandshake = useCallback((reason: "cancelled" | "timeout" | "expired" | "failed" = "cancelled") => {
    const room = roomCodeRef.current;
    handshakeAttemptRef.current += 1;
    clearHandshakeWatchdog();
    joinAbortRef.current?.abort();
    joinAbortRef.current = null;
    sseRef.current?.close();
    sseRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    remotePeerRef.current = null;
    detachPartnerStream();
    roleRef.current = null;
    setShowInvite(false);
    setHandshakeState("idle");
    setPeerConnected(false);
    setPartnerProfile(null);
    setPartnerLevel(0);
    setRoomRole(null);
    setStageQueue({ nowPlaying: null, upNext: [] });
    if (room) {
      void authHeaders().then((headers) => fetch(`/api/duet/room/${encodeURIComponent(room)}/leave`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ peerId: peerIdRef.current }),
      })).catch(() => {});
    }
    setInviteCode(newStageRoomCode());
    if (window.location.pathname.startsWith("/stage/duet/")) {
      setLocation("/main-stage");
    }
    if (reason === "timeout") {
      setError("Connection timed out. Partner did not respond or network blocked the handshake.");
    } else if (reason === "expired") {
      setError("This room session has expired. Start a new session.");
    }
  }, [authHeaders, clearHandshakeWatchdog, detachPartnerStream, setLocation]);

  const beginHandshakeWatchdog = useCallback((state: "joining" | "waiting" | "connecting") => {
    clearHandshakeWatchdog();
    const attempt = ++handshakeAttemptRef.current;
    setHandshakeState(state);
    handshakeTimerRef.current = window.setTimeout(() => {
      if (handshakeAttemptRef.current === attempt && !peerConnected) abortDuetHandshake("timeout");
    }, DUET_HANDSHAKE_TIMEOUT_MS);
    return attempt;
  }, [abortDuetHandshake, clearHandshakeWatchdog, peerConnected]);

  const sendSignal = useCallback(async (type: SignalType, payload: unknown) => {
    const to = remotePeerRef.current;
    if (!to) return;
    await fetch(`/api/duet/room/${encodeURIComponent(roomCodeRef.current)}/signal`, {
      method: "POST",
      headers: await authHeaders(),
      credentials: "include",
      body: JSON.stringify({ fromPeerId: peerIdRef.current, toPeerId: to, type, payload }),
    });
  }, [authHeaders]);

  const sendControl = useCallback((message: { kind: "review-start"; targetHostTime: number }) => {
    const channel = dataChannelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(message));
  }, []);

  const attachDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.onmessage = (event) => {
      let message: { kind?: string; targetHostTime?: number };
      try { message = JSON.parse(String(event.data)) as typeof message; } catch { return; }
      if (message.kind !== "review-start" || typeof message.targetHostTime !== "number") return;
      const wait = Math.max(0, message.targetHostTime - performance.now());
      window.setTimeout(() => {
        const audio = reviewAudioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }, wait);
    };
  }, []);

  const ensurePeerMic = useCallback(async (): Promise<MediaStream | null> => {
    if (peerMicStreamRef.current) return peerMicStreamRef.current;
    if (graphRef.current?.stream) {
      peerMicStreamRef.current = graphRef.current.stream;
      return peerMicStreamRef.current;
    }
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      peerMicStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          channelCount: 1,
          sampleRate: 48000,
        } as MediaTrackConstraints,
      });
      return peerMicStreamRef.current;
    } catch {
      return null;
    }
  }, []);

  // ── Partner audio: attach remote mic stream into an AnalyserNode ──────────
  const attachPartnerStream = useCallback((stream: MediaStream) => {
    detachPartnerStream();
    const ctx = partnerAudioCtxRef.current
      ?? new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    partnerAudioCtxRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();

    const gainNode        = ctx.createGain();
    gainNode.gain.value   = partnerVolume;
    const analyser        = ctx.createAnalyser();
    analyser.fftSize      = 1024;
    analyser.smoothingTimeConstant = 0.72;

    const source = ctx.createMediaStreamSource(stream);
    partnerSourceRef.current = source;
    source.connect(gainNode);
    gainNode.connect(analyser);
    gainNode.connect(ctx.destination);

    // Chromium does not pump a remote WebRTC track into a MediaStreamSource
    // unless the stream is also attached to a media element (crbug 121673).
    // A muted, detached <audio> sink keeps the analyser + gain path alive.
    if (!partnerSinkRef.current) {
      const sink = new Audio();
      sink.muted = true;
      sink.autoplay = true;
      partnerSinkRef.current = sink;
    }
    partnerSinkRef.current.srcObject = stream;
    void partnerSinkRef.current.play().catch(() => {});

    partnerGainRef.current     = gainNode;
    partnerAnalyserRef.current = analyser;
    setPartnerAnalyser(analyser);

    // Level meter RAF for partner glow
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      partnerRafRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(buf);
      const start = Math.floor(buf.length * 0.04);
      const end   = Math.max(start + 1, Math.floor(buf.length * 0.72));
      let sum = 0;
      for (let i = start; i < end; i++) sum += buf[i] ?? 0;
      setPartnerLevel(Math.min(1, (sum / (end - start)) / 255 * 1.85));
    };
    tick();
  }, [detachPartnerStream, partnerVolume]);

  // Sync partner volume to gainNode when slider changes
  useEffect(() => {
    const g = partnerGainRef.current;
    const ctx = partnerAudioCtxRef.current;
    if (g && ctx) g.gain.linearRampToValueAtTime(partnerVolume, ctx.currentTime + 0.02);
  }, [partnerVolume]);

  // Keep the backing track's master gain live while it is playing.
  useEffect(() => {
    const gain = playbackGainRef.current;
    const ctx = playbackContextRef.current;
    if (gain && ctx) {
      gain.gain.linearRampToValueAtTime(masterVolume, ctx.currentTime + 0.02);
    }
  }, [masterVolume]);

  // ── WebRTC peer connection ────────────────────────────────────────────────
  const handleSignal = useCallback(async (msg: { fromPeerId?: string; type?: unknown; payload?: unknown }) => {
    if (!msg.fromPeerId || !isSignalType(msg.type)) return;
    let pc = pcRef.current;
    if (!pc) {
      const attempt = handshakeAttemptRef.current;
      remotePeerRef.current = msg.fromPeerId;
      pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      const mic = await ensurePeerMic();
      if (handshakeAttemptRef.current !== attempt) return;
      if (mic) for (const track of mic.getTracks()) pc.addTrack(track, mic);
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        attachPartnerStream(stream);
      };
      pc.onconnectionstatechange = () => {
        if (pc!.connectionState === "connected") {
          clearHandshakeWatchdog();
          setHandshakeState("connected");
          setPeerConnected(true);
        }
        if (pc!.connectionState === "failed" || pc!.connectionState === "closed") {
          setPeerConnected(false);
          if (handshakeAttemptRef.current === attempt) abortDuetHandshake("failed");
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) void sendSignal("ice", event.candidate.toJSON());
      };
      pc.ondatachannel = (event) => attachDataChannel(event.channel);
    }
    if (msg.type === "offer") {
      await pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
      for (const c of pendingCandidatesRef.current.splice(0)) await pc.addIceCandidate(c);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal("answer", answer);
    } else if (msg.type === "answer") {
      await pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
      for (const c of pendingCandidatesRef.current.splice(0)) await pc.addIceCandidate(c);
    } else if (msg.type === "ice" && msg.payload) {
      if (!pc.remoteDescription) { pendingCandidatesRef.current.push(msg.payload as RTCIceCandidateInit); return; }
      await pc.addIceCandidate(msg.payload as RTCIceCandidateInit);
    }
  }, [abortDuetHandshake, attachDataChannel, attachPartnerStream, clearHandshakeWatchdog, ensurePeerMic, sendSignal]);

  const initiateOffer = useCallback(async (remotePeerId: string) => {
    if (pcRef.current) return;
    const attempt = handshakeAttemptRef.current;
    remotePeerRef.current = remotePeerId;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    const mic = await ensurePeerMic();
    if (handshakeAttemptRef.current !== attempt) return;
    if (mic) for (const track of mic.getTracks()) pc.addTrack(track, mic);
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      attachPartnerStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearHandshakeWatchdog();
        setHandshakeState("connected");
        setPeerConnected(true);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        setPeerConnected(false);
        if (handshakeAttemptRef.current === attempt) abortDuetHandshake("failed");
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal("ice", event.candidate.toJSON());
    };
    const channel = pc.createDataChannel("duet-stage", { ordered: true });
    attachDataChannel(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal("offer", offer);
  }, [abortDuetHandshake, attachDataChannel, attachPartnerStream, clearHandshakeWatchdog, ensurePeerMic, sendSignal]);

  // ── Join the room and open the SSE stream ────────────────────────────────
  const joinRoom = useCallback(async (code: string) => {
    const attempt = beginHandshakeWatchdog("joining");
    const controller = new AbortController();
    joinAbortRef.current = controller;
    roomCodeRef.current = code;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/duet/room/${encodeURIComponent(code)}/join`, {
        method: "POST", headers, credentials: "include",
        body: JSON.stringify({ peerId: peerIdRef.current }),
        signal: controller.signal,
      });
      if (handshakeAttemptRef.current !== attempt) return;
      const data = await res.json().catch(() => ({})) as {
        code?: string;
        error?: string;
        role?: "host" | "partner";
        otherPeerId?: string | null;
        otherPeerProfile?: ArtistProfile | null;
        queue?: StageQueueSnapshot;
      };
      if (res.status === 410 || data.code === "ROOM_EXPIRED") {
        abortDuetHandshake("expired");
        return;
      }
      if (!res.ok || !data.role) {
        abortDuetHandshake();
        setError(data.error || "Could not join this room.");
        return;
      }
      roleRef.current = data.role;
      setRoomRole(data.role);
      if (data.queue) setStageQueue(data.queue);
      setHandshakeState(data.otherPeerId ? "connecting" : "waiting");
      if (data.otherPeerId) {
        remotePeerRef.current = data.otherPeerId;
        setPartnerProfile(data.otherPeerProfile ?? null);
        setHandshakeState("connecting");
        if (data.role === "host") void initiateOffer(data.otherPeerId);
      }

      const sse = new EventSource(
        `/api/duet/room/${encodeURIComponent(code)}/events?peerId=${encodeURIComponent(peerIdRef.current)}`,
      );
      sseRef.current = sse;

      sse.addEventListener("peer-joined", (e) => {
        const joined = JSON.parse((e as MessageEvent).data) as { peerId?: string; profile?: ArtistProfile | null };
        if (!joined.peerId) return;
        remotePeerRef.current = joined.peerId;
        setPartnerProfile(joined.profile ?? null);
        setHandshakeState("connecting");
        setShowInvite(false);
        if (roleRef.current === "host") void initiateOffer(joined.peerId);
      });
      sse.addEventListener("signal", (e) => {
        void handleSignal(JSON.parse((e as MessageEvent).data) as { fromPeerId?: string; type?: unknown; payload?: unknown });
      });
      sse.addEventListener("room-expired", () => abortDuetHandshake("expired"));
      sse.addEventListener("queue-updated", (e) => {
        const next = JSON.parse((e as MessageEvent).data) as StageQueueSnapshot;
        setStageQueue({
          nowPlaying: next.nowPlaying ?? null,
          upNext: Array.isArray(next.upNext) ? next.upNext : [],
        });
      });
      sse.addEventListener("peer-left", () => {
        setPeerConnected(false);
        setPartnerProfile(null);
        setPartnerLevel(0);
        beginHandshakeWatchdog("waiting");
        pcRef.current?.close();
        pcRef.current = null;
        pendingCandidatesRef.current = [];
        remotePeerRef.current = null;
        detachPartnerStream();
      });
    } catch (cause) {
      if (controller.signal.aborted || handshakeAttemptRef.current !== attempt) return;
      abortDuetHandshake();
      setError(cause instanceof Error ? cause.message : "Could not join this room.");
    } finally {
      if (joinAbortRef.current === controller) joinAbortRef.current = null;
    }
  }, [abortDuetHandshake, authHeaders, beginHandshakeWatchdog, handleSignal, initiateOffer]);

  // On mount: if a ?room= param exists, join that room
  useEffect(() => {
    const pathRoom = window.location.pathname.match(/\/stage\/duet\/([^/]+)/)?.[1];
    const fromUrl = new URLSearchParams(window.location.search).get("room")
      ?? (pathRoom ? decodeURIComponent(pathRoom) : null);
    if (fromUrl) {
      const clean = fromUrl.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
      setInviteCode(clean);
      void joinRoom(clean);
    }
    return () => {
      handshakeAttemptRef.current += 1;
      clearHandshakeWatchdog();
      joinAbortRef.current?.abort();
      joinAbortRef.current = null;
      sseRef.current?.close();
      pcRef.current?.close();
      pendingCandidatesRef.current = [];
      cancelAnimationFrame(partnerRafRef.current);
    };
  }, [clearHandshakeWatchdog]);

  const openInvite = useCallback(async () => {
    setShowInvite(true);
    // Lazily join the room when the host first opens the invite card
    if (!sseRef.current) await joinRoom(inviteCode);
  }, [inviteCode, joinRoom]);

  // ── Monitor settings persistence + live AudioParam updates ───────────────
  useEffect(() => {
    try { localStorage.setItem(MONITOR_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* blocked */ }
    const g = graphRef.current;
    if (!g) return;
    g.gainNode.gain.linearRampToValueAtTime(settings.micGain, g.ctx.currentTime + 0.01);
    g.hpFilter.frequency.linearRampToValueAtTime(settings.hpfOn ? 80 : 20, g.ctx.currentTime + 0.02);
    g.warmthFilter.gain.linearRampToValueAtTime(settings.warmth, g.ctx.currentTime + 0.02);
    g.reverbSend.gain.linearRampToValueAtTime(settings.reverbSend, g.ctx.currentTime + 0.02);
  }, [settings]);

  // ── Monitor start / stop ──────────────────────────────────────────────────
  const stopMonitor = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const g = graphRef.current;
    if (g) {
      try { g.source.disconnect(); } catch { /* ok */ }
      if (peerMicStreamRef.current !== g.stream) g.stream.getTracks().forEach(t => t.stop());
      void g.ctx.close();
      graphRef.current = null;
    }
    setMonitorOn(false);
    setLevel(0);
  }, []);

  const startMonitor = useCallback(async (): Promise<MediaStream | null> => {
    stopMonitor();
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture is not supported in this browser.");
      return null;
    }
    try {
      const stream = peerMicStreamRef.current ?? await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          latency: 0,
          channelCount: 1,
        sampleRate: 48000,
        } as MediaTrackConstraints,
      });
      peerMicStreamRef.current = stream;
      const g = buildMonitorGraph(stream, settings.micGain, settings.hpfOn, settings.warmth, settings.reverbSend);
      if (g.ctx.state === "suspended") await g.ctx.resume();
      graphRef.current = g;
      setMonitorOn(true);
      setFxOpen(true);
      if (typeof navigator.mediaDevices.enumerateDevices === "function") {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setBluetoothOutput(devices
          .filter((device) => device.kind === "audiooutput")
          .some((device) => /bluetooth|airpods|wireless|buds|jabra|bose|sony\s*(wh|wf)|beats|galaxy\s*buds|pixel\s*buds/i.test(device.label)));
      }

      // Level meter + waveform RAF
      const timeDomain = new Uint8Array(g.analyser.frequencyBinCount);
      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        g.analyser.getByteTimeDomainData(timeDomain);
        let sum = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const v = (timeDomain[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / timeDomain.length) * 6));

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return;
        const W = canvas.width, H = canvas.height;
        ctx2d.clearRect(0, 0, W, H);
        ctx2d.strokeStyle = "#22c55e";
        ctx2d.lineWidth   = 1.5;
        ctx2d.beginPath();
        const slice = W / timeDomain.length;
        for (let i = 0; i < timeDomain.length; i++) {
          const y = ((timeDomain[i] - 128) / 128) * (H / 2) + H / 2;
          i === 0 ? ctx2d.moveTo(0, y) : ctx2d.lineTo(i * slice, y);
        }
        ctx2d.stroke();
      };
      draw();

      // Also add mic tracks to any already-open peer connection for the partner
      const pc = pcRef.current;
      if (pc) {
        for (const track of stream.getTracks()) {
          const senders = pc.getSenders();
          if (!senders.some(s => s.track === track)) pc.addTrack(track, stream);
        }
      }
      return stream;
    } catch (e: unknown) {
      const name    = (e as { name?: string })?.name;
      const message = (e as { message?: string })?.message ?? "Unknown error";
      setError(
        name === "NotAllowedError"
          ? "Microphone access denied — allow it in your browser settings."
          : message,
      );
      return null;
    }
  }, [settings, stopMonitor]);

  const toggleMonitor = useCallback(() => {
    if (monitorOn) { stopMonitor(); setFxOpen(false); }
    else void startMonitor();
  }, [monitorOn, startMonitor, stopMonitor]);

  // ── Pristine local take buffer ────────────────────────────────────────────
  const stopTake = useCallback(() => {
    const recorder = takeRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    takeRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const startTake = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      setError("This browser cannot record an in-memory vocal take.");
      return;
    }
    const stream = peerMicStreamRef.current ?? await startMonitor();
    if (!stream) return;
    stopTake();
    takeChunksRef.current = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) takeChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(takeChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) setTakeBlob(blob);
      };
      recorder.start(750);
      takeRecorderRef.current = recorder;
      setTakeBlob(null);
      setIsRecording(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the local take recorder.");
    }
  }, [startMonitor, stopTake]);

  const toggleTake = useCallback(() => {
    if (isRecording) stopTake();
    else void startTake();
  }, [isRecording, startTake, stopTake]);

  // ── AudioContext-backed backing track clock ───────────────────────────────
  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(playbackRafRef.current);
    try { playbackSourceRef.current?.stop(); } catch { /* already ended */ }
    playbackSourceRef.current = null;
    playbackGainRef.current = null;
    playbackStartContextRef.current = null;
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    const buffer = backingBufferRef.current;
    if (!buffer) {
      setError("Load a backing track before pressing play.");
      return;
    }
    const ctx = playbackContextRef.current ?? new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    playbackContextRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    try { playbackSourceRef.current?.stop(); } catch { /* no active source */ }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
    const offset = Math.max(0, Math.min(playbackOffsetRef.current, Math.max(0, buffer.duration - 0.01)));
    const startAt = ctx.currentTime + 0.03;
    source.start(startAt, offset);
    playbackSourceRef.current = source;
    playbackGainRef.current = masterGain;
    playbackStartContextRef.current = startAt - offset;
    setIsPlaying(true);
    source.onended = () => {
      if (playbackSourceRef.current !== source) return;
      playbackSourceRef.current = null;
      playbackGainRef.current = null;
      playbackStartContextRef.current = null;
      playbackOffsetRef.current = 0;
      setPlaybackPosition(buffer.duration);
      setIsPlaying(false);
      stopTake();
    };
  }, [masterVolume, stopTake]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      const ctx = playbackContextRef.current;
      const startAt = playbackStartContextRef.current;
      if (ctx && startAt != null) {
        playbackOffsetRef.current = Math.max(0, Math.min(durationSec, ctx.currentTime - startAt));
      }
      stopPlayback();
      return;
    }
    startPlayback();
  }, [durationSec, isPlaying, startPlayback, stopPlayback]);

  const seekPlayback = useCallback((fraction: number) => {
    const next = Math.max(0, Math.min(1, fraction)) * durationSec;
    const wasPlaying = isPlaying;
    stopPlayback();
    playbackOffsetRef.current = next;
    setPlaybackPosition(next);
    if (wasPlaying) window.setTimeout(startPlayback, 0);
  }, [durationSec, isPlaying, startPlayback, stopPlayback]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const ctx = playbackContextRef.current;
      const startAt = playbackStartContextRef.current;
      if (ctx && startAt != null) {
        setPlaybackPosition(Math.max(0, Math.min(durationSec, ctx.currentTime - startAt)));
      }
      playbackRafRef.current = requestAnimationFrame(tick);
    };
    playbackRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playbackRafRef.current);
  }, [durationSec, isPlaying]);

  const openVault = useCallback(async () => {
    setVaultOpen(true);
    setVaultLoading(true);
    setVaultError(null);
    try {
      const [localEntries, serverResp] = await Promise.allSettled([
        listStageCatalogEntries(),
        fetch("/api/library", { credentials: "include" }).then((r) => r.ok ? r.json() as Promise<{ tracks?: LibraryTrack[] }> : { tracks: [] }),
      ]);
      setVaultEntries(localEntries.status === "fulfilled" ? localEntries.value : []);
      setServerTracks(serverResp.status === "fulfilled" ? (serverResp.value.tracks ?? []) : []);
      if (localEntries.status === "rejected" && serverResp.status === "rejected") {
        setVaultError("Could not load Stage Vault.");
      }
    } finally {
      setVaultLoading(false);
    }
  }, []);

  const selectServerTrack = useCallback(async (track: LibraryTrack) => {
    setVaultError(null);
    try {
      const context = playbackContextRef.current
        ?? new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
      playbackContextRef.current = context;
      stopPlayback();
      const resp = await fetch(`/api/tracks/${track.id}/stream`, { credentials: "include" });
      if (!resp.ok) throw new Error(`Could not stream track (${resp.status})`);
      const buffer = await context.decodeAudioData(await resp.arrayBuffer());
      backingBufferRef.current = buffer;
      playbackOffsetRef.current = 0;
      setPlaybackPosition(0);
      setDurationSec(buffer.duration);
      setTrackName(track.title);
      setStageLyrics([]);
      setTakeBlob(null);
      setError(null);
      setVaultOpen(false);
    } catch (cause) {
      setVaultError(cause instanceof Error ? cause.message : "Could not load track from Library.");
    }
  }, [stopPlayback]);

  const selectVaultSong = useCallback(async (entry: StageCatalogEntry) => {
    try {
      const context = playbackContextRef.current
        ?? new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
      playbackContextRef.current = context;
      stopPlayback();
      const buffer = await decodeStageCatalogAudio(context, entry.instrumental);
      backingBufferRef.current = buffer;
      playbackOffsetRef.current = 0;
      setPlaybackPosition(0);
      setDurationSec(buffer.duration);
      setTrackName(entry.title);
      // Tracks without synced lyrics are valid — show a placeholder instead of blocking load.
      setStageLyrics(
        entry.lines.length > 0
          ? stageCatalogLinesToPrompterLines(entry.lines)
          : [],
      );
      setTakeBlob(null);
      setError(null);
      setVaultOpen(false);
    } catch (cause) {
      setVaultError(cause instanceof Error ? cause.message : "Could not load this song from Stage Vault.");
    }
  }, [stopPlayback]);

  // Load a locally available queue winner on the device that submitted it.
  // Other peers still receive the ordered deck metadata from the server.
  useEffect(() => {
    const active = stageQueue.nowPlaying;
    if (!active || activeQueueItemRef.current === active.id) return;
    activeQueueItemRef.current = active.id;
    if (active.queuedByPeerId !== peerIdRef.current) {
      // Never leave the previous winner playing after the Host advances.
      stopPlayback();
      backingBufferRef.current = null;
      playbackOffsetRef.current = 0;
      setPlaybackPosition(0);
      setDurationSec(active.durationSeconds ?? 0);
      setTrackName(active.title);
      setStageLyrics([]);
      return;
    }
    let cancelled = false;
    void listStageCatalogEntries().then((entries) => {
      const entry = entries.find((candidate) => candidate.id === active.trackId);
      if (!cancelled && entry) void selectVaultSong(entry);
    });
    return () => { cancelled = true; };
  }, [selectVaultSong, stageQueue.nowPlaying, stopPlayback]);

  const queueVaultSong = useCallback(async (entry: StageCatalogEntry) => {
    if (!roleRef.current) {
      await selectVaultSong(entry);
      return;
    }
    setQueueBusy(true);
    setVaultError(null);
    try {
      const response = await fetch(`/api/duet/room/${encodeURIComponent(roomCodeRef.current)}/queue`, {
        method: "POST",
        headers: await authHeaders(),
        credentials: "include",
        body: JSON.stringify({
          peerId: peerIdRef.current,
          trackId: entry.id,
          title: entry.title,
          durationSeconds: entry.durationSeconds ?? null,
          hasSyncedLyrics: entry.lines.length > 0,
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        queue?: StageQueueSnapshot;
      };
      if (!response.ok) throw new Error(body.error || "Could not queue this song.");
      if (body.queue) setStageQueue(body.queue);
      setVaultOpen(false);
    } catch (cause) {
      setVaultError(cause instanceof Error ? cause.message : "Could not queue this song.");
    } finally {
      setQueueBusy(false);
    }
  }, [authHeaders, selectVaultSong]);

  const advanceQueue = useCallback(async () => {
    if (roleRef.current !== "host") return;
    setQueueBusy(true);
    try {
      const response = await fetch(`/api/duet/room/${encodeURIComponent(roomCodeRef.current)}/queue/advance`, {
        method: "POST",
        headers: await authHeaders(),
        credentials: "include",
        body: JSON.stringify({ peerId: peerIdRef.current }),
      });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        queue?: StageQueueSnapshot;
      };
      if (!response.ok) throw new Error(body.error || "Could not advance the queue.");
      if (body.queue) setStageQueue(body.queue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not advance the queue.");
    } finally {
      setQueueBusy(false);
    }
  }, [authHeaders]);

  // Arriving from Track & Lyric Prep with ?song=<vault id>: arm that project immediately.
  useEffect(() => {
    const songId = new URLSearchParams(window.location.search).get("song");
    if (!songId) return;
    let cancelled = false;
    void listStageCatalogEntries().then((entries) => {
      const match = entries.find((entry) => entry.id === songId);
      if (!cancelled && match) void selectVaultSong(match);
    }).catch((cause) => {
      if (!cancelled) setVaultError(cause instanceof Error ? cause.message : "Could not load the prepared song.");
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Review actions: local mixdown, synchronized playback, or RAM flush ──
  const playReview = useCallback(() => {
    if (!reviewUrl) return;
    const targetHostTime = performance.now() + 500;
    if (roleRef.current === "host") sendControl({ kind: "review-start", targetHostTime });
    window.setTimeout(() => {
      const audio = reviewAudioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }, Math.max(0, targetHostTime - performance.now()));
  }, [reviewUrl, sendControl]);

  const renderPerformanceWav = useCallback(async (): Promise<Blob> => {
    if (!takeBlob) throw new Error("Record a Main Stage performance first.");
    const decodeContext = playbackContextRef.current ?? new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    const vocal = await decodeContext.decodeAudioData(await takeBlob.arrayBuffer());
    const sampleRate = 48000;
    const backing = backingBufferRef.current;
    const frameCount = Math.max(
      1,
      Math.ceil((backing?.duration ?? 0) * sampleRate),
      Math.ceil(vocal.duration * sampleRate),
    );
    const offline = new OfflineAudioContext(2, frameCount, sampleRate);
    if (backing) {
      const backingSource = offline.createBufferSource();
      backingSource.buffer = backing;
      const backingGain = offline.createGain();
      backingGain.gain.value = 0.82;
      backingSource.connect(backingGain).connect(offline.destination);
      backingSource.start(0);
    }
    const vocalSource = offline.createBufferSource();
    vocalSource.buffer = vocal;
    const vocalGain = offline.createGain();
    vocalGain.gain.value = 0.95;
    vocalSource.connect(vocalGain).connect(offline.destination);
    vocalSource.start(0);
    const rendered = await offline.startRendering();
    return encodePcm24Wav(
      [rendered.getChannelData(0), rendered.getChannelData(1)],
      rendered.sampleRate,
    );
  }, [takeBlob]);

  const saveToVault = useCallback(async () => {
    if (!takeBlob) return;
    if (savedTakeRef.current === takeBlob) {
      setTakeSavedMessage("This take is already saved in your private Vault. Contest submission remains optional.");
      return;
    }
    setSavingTake(true);
    try {
      const wav = await renderPerformanceWav();
      const createdAt = new Date();
      const baseTitle = trackName || "Main Stage";
      const existing = await listStageCatalogEntries();
      const takeNumber = existing.filter((entry) => entry.title.startsWith(`${baseTitle} — Take `)).length + 1;
      const title = `${baseTitle} — Take ${takeNumber} — ${createdAt.toLocaleString()}`;
      await saveStageCatalogEntry({
        id: crypto.randomUUID(),
        createdAt: createdAt.toISOString(),
        title,
        instrumental: wav,
        guideVocal: null,
        lines: stageLyrics.map((line, lineIndex) => ({
          lineIndex,
          contextTime: 0,
          timeSeconds: line.startTimeMs / 1000,
          text: line.text,
        })),
        durationSeconds: durationSec,
      });
      setVaultEntries(await listStageCatalogEntries());
      savedTakeRef.current = takeBlob;
      setTakeSavedMessage(`Saved ${baseTitle} — Take ${takeNumber} to your private Vault. Contest submission is optional.`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this take to Vault.");
    } finally {
      setSavingTake(false);
    }
  }, [durationSec, renderPerformanceWav, stageLyrics, takeBlob, trackName]);

  const submitFeaturedAudition = useCallback(async () => {
    if (!takeBlob || !contestArtistName.trim() || !featureConsent) return;
    setContestSubmitting(true);
    setContestMessage("Rendering the complete performance…");
    try {
      const wav = await renderPerformanceWav();
      const title = (trackName || "Main Stage Performance").trim();
      const safeTitle = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "main-stage-performance";
      const token = await getToken();
      const masterData = new FormData();
      masterData.append("audio", new File([wav], `${safeTitle}.wav`, { type: "audio/wav" }));
      masterData.append("mode", "master");
      masterData.append("preset", "balanced");
      masterData.append("certify", "true");
      masterData.append("author_assertion", "true");
      masterData.append("artist", contestArtistName.trim());
      masterData.append("certCategory", "vocal_performance");
      masterData.append("certProvenance", "vocal_recording");
      masterData.append("sourceContext", "main_stage");
      setContestMessage("Applying MLK V4 and embedding the GravelKing IP seal…");
      const masterResponse = await fetch("/api/kernel/master", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: masterData,
      });
      const jobId = masterResponse.headers.get("X-GK-Master-Job-Id");
      const certification = masterResponse.headers.get("X-GK-Certification");
      if (!masterResponse.ok) {
        const body = await masterResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "The Main Stage master could not be completed.");
      }
      if (!jobId) throw new Error("The mastering server did not return a durable job record.");
      if (certification !== "sealed" && certification !== "sealed-local") {
        throw new Error("The performance was mastered, but its IP seal could not be issued. It was not entered.");
      }
      setContestMessage("Submitting the sealed performance for owner review…");
      const submissionResponse = await fetch("/api/featured-contest/submissions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title,
          artistName: contestArtistName.trim(),
          masterJobId: jobId,
          featureConsent,
          outreachConsent,
        }),
      });
      const submission = await submissionResponse.json().catch(() => ({})) as { error?: string };
      if (!submissionResponse.ok) throw new Error(submission.error || "The sealed performance could not be entered.");
      setContestMessage("Audition submitted. GravelKing Productions will review it for one of 10 Featured Artist spots.");
    } catch (cause) {
      setContestMessage(cause instanceof Error ? cause.message : "The audition could not be submitted.");
    } finally {
      setContestSubmitting(false);
    }
  }, [contestArtistName, featureConsent, getToken, outreachConsent, renderPerformanceWav, takeBlob, trackName]);

  const downloadTake = useCallback(() => {
    if (!takeBlob) return;
    const safeName = (trackName || "main-stage-take")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "main-stage-take";
    downloadBlob(takeBlob, `${safeName}.webm`);
  }, [takeBlob, trackName]);

  const retake = useCallback(() => {
    stopPlayback();
    stopTake();
    takeChunksRef.current = [];
    setTakeBlob(null);
    setTakeSavedMessage(null);
    setPlaybackPosition(0);
    playbackOffsetRef.current = 0;
  }, [stopPlayback, stopTake]);

  useEffect(() => () => stopMonitor(), [stopMonitor]);

  // Unmount cleanup: stop all audio so nothing keeps playing after navigation.
  useEffect(() => () => {
    cancelAnimationFrame(playbackRafRef.current);
    try { playbackSourceRef.current?.stop(); } catch { /* already ended */ }
    void playbackContextRef.current?.close().catch(() => {});
    void partnerAudioCtxRef.current?.close().catch(() => {});
    detachPartnerStream();
    playbackGainRef.current = null;
  }, [detachPartnerStream]);

  const goToTrackPrep = useCallback(() => {
    stopMonitor();
    setLocation("/studio/track-prep");
  }, [setLocation, stopMonitor]);

  // Primary CTA card shown on the jumbotron while nothing is loaded on the stage.
  const emptyStageCard = (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-amber-300/30 bg-black/40 px-5 py-5 text-center" data-testid="stage-empty-prep-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300/80">No track on stage</p>
      <p className="text-sm text-white/70">Prep a backing track and time the lyrics, or load a song you already prepared.</p>
      <button
        type="button"
        onClick={goToTrackPrep}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.35)] transition-colors hover:bg-amber-300"
        aria-label="Prep Backing Track & Sync Lyrics"
      >
        🎙️ Prep Backing Track &amp; Sync Lyrics
      </button>
      <button
        type="button"
        onClick={() => void openVault()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-amber-200 transition-colors hover:bg-amber-300/20"
      >
        📂 Load from Vault
      </button>
    </div>
  );

  const audioOnlyCard = (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-sky-300/25 bg-black/45 px-5 py-5 text-center" data-testid="audio-only-visualizer">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-300/80">Audio-Only Mode</p>
      <h2 className="mt-2 truncate text-xl font-black text-white">{trackName}</h2>
      <p className="mt-1 font-mono text-xs text-white/45">
        {Math.floor(durationSec / 60)}:{Math.floor(durationSec % 60).toString().padStart(2, "0")} · Free Performance
      </p>
      <div className="mx-auto mt-5 flex h-12 max-w-xs items-end justify-center gap-1.5" aria-label="Audio-only playback visualizer">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            className={`w-2 rounded-full bg-gradient-to-t from-sky-500 to-amber-300 ${isPlaying ? "animate-pulse" : "opacity-40"}`}
            style={{ height: `${20 + ((index * 17) % 75)}%`, animationDelay: `${index * 45}ms` }}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-white/50">Transport, scrubber, live monitor, and recording remain fully active.</p>
    </div>
  );

  // ── Monitor toggle button (bottom rail control slot) ─────────────────────
  const controlSlot = (
    <div className="flex items-center gap-1.5">
      <label className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1.5 text-[10px] text-white/65" title="Backing track master volume">
        {masterVolume === 0 ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        <span className="hidden sm:inline uppercase tracking-widest">Track</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(event) => setMasterVolume(Number(event.target.value))}
          aria-label="Backing track master volume"
          className="h-11 min-h-11 w-16 accent-amber-300 sm:w-20"
        />
        <span className="w-8 text-right font-mono text-[9px]">{Math.round(masterVolume * 100)}%</span>
      </label>
      <button
        type="button"
        onClick={() => void openVault()}
        className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-200 transition-colors hover:bg-amber-300/20"
        aria-label="Select song from Vault"
      >
        <FolderOpen className="h-3 w-3" />
        <span className="hidden sm:inline">Select song from Vault</span>
      </button>
      <button
        type="button"
        onClick={toggleTake}
        aria-pressed={isRecording}
        aria-label={isRecording ? "Stop recording take" : "Record take"}
        className={[
          "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-all",
          isRecording
            ? "border-red-400/60 bg-red-500/20 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.28)]"
            : "border-white/15 text-white/65 hover:border-red-300/45 hover:text-red-200",
        ].join(" ")}
      >
        {isRecording ? <Square className="h-3 w-3 fill-current" /> : <span className="h-2 w-2 rounded-full bg-red-400" />}
        <span className="hidden sm:inline">{isRecording ? "Recording" : "Record take"}</span>
      </button>
      <button
        type="button"
        onClick={toggleMonitor}
        aria-pressed={monitorOn}
        aria-label={monitorOn ? "Turn monitor mic off" : "Turn monitor mic on"}
        className={[
          "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-all",
          monitorOn
            ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(34,197,94,0.28)]"
            : "border-white/20 text-white/60 hover:border-white/40 hover:text-white",
        ].join(" ")}
      >
        {monitorOn ? <Headphones className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
        <span className="hidden sm:inline">🎧 Monitor mic</span>
        {monitorOn && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
      </button>
    </div>
  );

  return (
    <Layout hideChrome noPadding>
      {/* ── Fullscreen karaoke stage: local performer takes full viewport ─── */}
      <LivePerformanceStage
        title="Main Stage"
        subtitle="Karaoke · Live Monitor"
        trackName={trackName}
        isPlaying={isPlaying}
        currentTimeSec={playbackPosition}
        durationSec={durationSec}
        lyrics={stageLyrics}
        performers={[
          {
            id:       "host",
            label:    monitorOn ? "Live mic" : "Standby",
            name:     "You",
            accent:   "gold",
            analyser: graphRef.current?.analyser ?? null,
            status:   monitorOn ? "Live mic" : "Standby",
          },
          // A connected duet partner gets their own riser, driven by the real
          // remote-stream analyser, so both singers share the stage floor.
          ...(peerConnected
            ? [{
                id:        "partner",
                label:     "Live · synced",
                name:      partnerProfile?.artistName?.trim() || "Duet partner",
                avatarUrl: partnerProfile?.avatarUrl ?? null,
                accent:    "violet" as const,
                analyser:  partnerAnalyser,
                status:    "Live · synced",
              }]
            : []),
        ]}
        onExit={() => { stopMonitor(); window.history.back(); }}
        onTogglePlayback={togglePlayback}
        onStop={retake}
        onSeek={seekPlayback}
        onRecord={toggleTake}
        isRecording={isRecording}
        recordDisabled={false}
        controlSlot={controlSlot}
        emptySlot={!trackName ? emptyStageCard : stageLyrics.length === 0 ? audioOnlyCard : undefined}
        stageMode={peerConnected ? "duet" : "solo"}
        audioContextTimeSec={playbackContextRef.current?.currentTime}
        playbackStartContextTimeSec={playbackStartContextRef.current}
      />

      <audio ref={reviewAudioRef} src={reviewUrl ?? undefined} preload="auto" className="hidden" />

      {error && (
        <div
          className="fixed left-1/2 top-20 z-[90] w-[min(92vw,38rem)] -translate-x-1/2 rounded-xl border border-red-400/35 bg-zinc-950/95 px-4 py-3 text-center text-sm text-red-200 shadow-2xl backdrop-blur-md"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {vaultOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Select song from Vault"
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950/98 p-5 shadow-[0_8px_64px_rgba(0,0,0,0.8)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Stage Vault</p>
                <h2 className="mt-1 text-xl font-black text-white">Select Song from Vault</h2>
                <p className="mt-1 text-xs text-white/45">All saved audio tracks. Synced lyrics load the prompter; audio-only tracks play immediately.</p>
              </div>
              <button type="button" onClick={() => setVaultOpen(false)} className="rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close Vault selector">
                <X className="h-4 w-4" />
              </button>
            </div>

            {vaultLoading && <p className="rounded-xl border border-white/10 px-3 py-4 text-center text-xs text-white/50">Loading prepared songs…</p>}
            {vaultError && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-200">{vaultError}</p>}
            {!vaultLoading && !vaultError && vaultEntries.length === 0 && serverTracks.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
                <FolderOpen className="mx-auto h-6 w-6 text-amber-300/70" />
                <p className="mt-2 text-sm font-semibold text-white/75">Vault is empty</p>
                <p className="mt-1 text-xs text-white/40">Save any audio track from Track &amp; Lyric Prep to see it here.</p>
                <a href="/studio/track-prep" className="mt-4 inline-flex rounded-lg bg-amber-300 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-200">
                  Open Track Prep
                </a>
              </div>
            )}
            {!vaultLoading && (vaultEntries.length > 0 || serverTracks.length > 0) && (
              <div className="max-h-[min(55vh,26rem)] space-y-2 overflow-y-auto">
                {vaultEntries.map((entry) => {
                  const hasSyncedLyrics = entry.lines.length > 0;
                  const dur = entry.durationSeconds;
                  const durStr = typeof dur === "number"
                    ? `${Math.floor(dur / 60)}:${Math.floor(dur % 60).toString().padStart(2, "0")}`
                    : null;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => void (roomRole ? queueVaultSong(entry) : selectVaultSong(entry))}
                      disabled={queueBusy}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-amber-300/40 hover:bg-amber-300/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{entry.title}</span>
                        <span className="mt-1 block text-[10px] text-white/40">
                          {hasSyncedLyrics ? `${entry.lines.length} synced lines` : "Audio only"}
                          {durStr ? ` · ${durStr}` : ""}
                          {" · "}{new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                      {hasSyncedLyrics ? (
                        <span className="shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-200">🎙️ Synced</span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-200">🎵 Audio</span>
                      )}
                      {roomRole && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-violet-200">+ Queue</span>
                      )}
                    </button>
                  );
                })}
                {serverTracks.length > 0 && (
                  <>
                    {vaultEntries.length > 0 && (
                      <p className="px-1 pt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">Library tracks</p>
                    )}
                    {serverTracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => void selectServerTrack(track)}
                        disabled={queueBusy}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-amber-300/40 hover:bg-amber-300/10"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
                          <span className="mt-1 block text-[10px] text-white/40">
                            {track.artistName ? `${track.artistName} · ` : ""}Library
                            {track.createdAt ? ` · ${new Date(track.createdAt).toLocaleDateString()}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-200">☁ Cloud</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Partner HUD: floating corner bubble + invite modal ──────────── */}
      <PartnerHud
        connected={peerConnected}
        profile={partnerProfile}
        partnerLevel={partnerLevel}
        volume={partnerVolume}
        onVolumeChange={setPartnerVolume}
        showInvite={showInvite}
        inviteCode={inviteCode}
        onOpenInvite={() => void openInvite()}
        onDismissInvite={() => setShowInvite(false)}
        handshakeState={handshakeState}
        onCancelHandshake={() => abortDuetHandshake("cancelled")}
      />

      {(stageQueue.nowPlaying || stageQueue.upNext.length > 0) && (
        <aside className="fixed right-4 top-20 z-[61] w-[min(88vw,19rem)] rounded-2xl border border-violet-300/20 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-md" aria-label="Duet stage queue">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
              <ListMusic className="h-3.5 w-3.5" /> Duet Queue
            </p>
            {roomRole === "host" && (
              <button
                type="button"
                onClick={() => void advanceQueue()}
                disabled={queueBusy || !stageQueue.nowPlaying}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300/30 px-2 py-1 text-[9px] font-bold uppercase text-amber-200 disabled:opacity-35"
                aria-label="Advance duet queue"
              >
                <SkipForward className="h-3 w-3" /> Advance
              </button>
            )}
          </div>
          {stageQueue.nowPlaying && (
            <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-300">Now Playing</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{stageQueue.nowPlaying.title}</p>
              <p className="mt-1 text-[10px] text-white/40">
                Queued by {stageQueue.nowPlaying.queuedByRole === "host" ? "Host" : "Guest"} · audition owner
              </p>
            </div>
          )}
          <div className="mt-2 space-y-1.5">
            {stageQueue.upNext.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <span className="font-mono text-[10px] text-white/30">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-white/70">{item.title}</span>
                <span className="text-[9px] uppercase text-white/35">{item.queuedByRole === "host" ? "Host" : "Guest"}</span>
              </div>
            ))}
            {stageQueue.upNext.length === 0 && <p className="px-1 py-1 text-[10px] text-white/30">Up Next is empty.</p>}
          </div>
        </aside>
      )}

      {takeBlob && reviewUrl && !isRecording && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Post-performance take">
          <DuetReviewCard
            trackName={trackName}
            durationSec={durationSec}
            saving={savingTake}
            onPlayReview={playReview}
            onDownloadTake={downloadTake}
            onSaveToVault={() => void saveToVault()}
            onRetake={retake}
            contestArtistName={contestArtistName}
            onContestArtistNameChange={setContestArtistName}
            featureConsent={featureConsent}
            onFeatureConsentChange={setFeatureConsent}
            outreachConsent={outreachConsent}
            onOutreachConsentChange={setOutreachConsent}
            contestSubmitting={contestSubmitting}
            contestMessage={contestMessage}
            onSubmitContest={() => void submitFeaturedAudition()}
            auditionDisabled={Boolean(
              stageQueue.nowPlaying
              && stageQueue.nowPlaying.queuedByPeerId !== peerIdRef.current
            )}
          />
        </div>
      )}

      {takeSavedMessage && (
        <div className="fixed bottom-24 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-300/25 bg-zinc-950/95 px-4 py-3 text-sm text-emerald-200 shadow-2xl" role="status">
          <Check className="h-4 w-4" />
          {takeSavedMessage}
          <button type="button" onClick={() => setTakeSavedMessage(null)} className="ml-2 text-white/45 hover:text-white" aria-label="Dismiss saved message"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── FX Rack overlay panel ─────────────────────────────────────────── */}
      {fxOpen && (
        <div
          className={[
            "fixed z-[60] max-h-[calc(100vh-7rem)] w-72 overflow-y-auto rounded-2xl border border-white/10",
            "bg-zinc-950/96 p-4 shadow-[0_4px_40px_rgba(0,0,0,0.6)] backdrop-blur-md",
            // Offset from the right to avoid overlapping the partner HUD bubble
            "bottom-20 left-4 sm:bottom-24 sm:left-6 sm:w-80",
          ].join(" ")}
          role="region"
          aria-label="Live monitor FX rack"
        >
          {/* Panel header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={["h-2 w-2 rounded-full", monitorOn ? "animate-pulse bg-emerald-400" : "bg-white/20"].join(" ")} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Live FX Monitor</span>
            </div>
            <button type="button" onClick={() => setFxOpen(false)} aria-label="Close FX rack" className="rounded p-1 text-white/40 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Waveform oscilloscope */}
          <canvas
            ref={canvasRef}
            width={288}
            height={36}
            className="mb-2 w-full rounded-lg border border-white/10 bg-black/50"
            style={{ height: 36 }}
            aria-label="Live input waveform"
          />

          {/* Level bar meter */}
          <div
            className="mb-4 flex h-2.5 items-end gap-0.5 overflow-hidden rounded-full"
            role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}
            aria-label="Input level meter"
          >
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all duration-75"
                style={{
                  background: i < 13 ? "#22c55e" : i < 17 ? "#f59e0b" : "#ef4444",
                  opacity: level * 20 > i ? 1 : 0.15,
                }}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-[11px] text-red-400">{error}</p>
          )}
          {bluetoothOutput && (
            <div className="mb-3 rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-[10px] leading-snug text-sky-100">
              <strong>Bluetooth output detected.</strong> Connect wired headphones before monitoring or recording to avoid feedback and timing drift.
            </div>
          )}

          {/* FX controls */}
          <div className="space-y-5">
            {/* Mic Gain */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-medium text-white/70">Mic Gain</label>
                <span className="font-mono text-[10px] text-emerald-400">{Math.round(settings.micGain * 100)} %</span>
              </div>
              <Slider min={0} max={2} step={0.01} value={[settings.micGain]}
                onValueChange={([v]) => { if (v !== undefined) setSettings(s => ({ ...s, micGain: v })); }}
                aria-label="Mic Gain" />
            </div>

            {/* 80 Hz HPF */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-medium text-white/70">80 Hz Highpass Cut</label>
                <span className={["rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", settings.hpfOn ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-white/30"].join(" ")}>
                  {settings.hpfOn ? "ON" : "OFF"}
                </span>
              </div>
              <p className="mb-2 text-[9px] leading-snug text-muted-foreground">Removes mic rumble and handling noise. Recommended for live performance.</p>
              <button type="button"
                onClick={() => setSettings(s => ({ ...s, hpfOn: !s.hpfOn }))}
                className={["w-full rounded-lg border py-1.5 text-[11px] font-medium transition-colors", settings.hpfOn ? "border-sky-400/40 bg-sky-400/10 text-sky-300 hover:bg-sky-400/15" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"].join(" ")}>
                {settings.hpfOn ? "HPF Active — click to disable" : "HPF Off (flat) — click to enable"}
              </button>
            </div>

            {/* Warmth EQ */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-medium text-white/70">Studio Warmth EQ</label>
                <span className="font-mono text-[10px] text-amber-400">{settings.warmth >= 0 ? "+" : ""}{settings.warmth.toFixed(1)} dB</span>
              </div>
              <Slider min={-3} max={6} step={0.1} value={[settings.warmth]}
                onValueChange={([v]) => { if (v !== undefined) setSettings(s => ({ ...s, warmth: v })); }}
                aria-label="Studio Warmth EQ" />
              <p className="mt-1 text-[9px] text-muted-foreground">Low-shelf at 250 Hz — adds body and vocal warmth</p>
            </div>

            {/* Reverb Send */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-medium text-white/70">Reverb Send</label>
                <span className="font-mono text-[10px] text-violet-400">{Math.round(settings.reverbSend * 100)} %</span>
              </div>
              <Slider min={0} max={1} step={0.01} value={[settings.reverbSend]}
                onValueChange={([v]) => { if (v !== undefined) setSettings(s => ({ ...s, reverbSend: v })); }}
                aria-label="Reverb Send" />
              <p className="mt-1 text-[9px] text-muted-foreground">Warm room reverb — use headphones to prevent feedback</p>
            </div>
          </div>

          {/* Monitor toggle in panel footer */}
          <div className="mt-5 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={toggleMonitor}
              className={[
                "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                monitorOn
                  ? "bg-emerald-500/20 text-emerald-300 hover:bg-red-500/15 hover:text-red-300"
                  : "bg-white/5 text-white/50 hover:bg-emerald-500/15 hover:text-emerald-300",
              ].join(" ")}
            >
              <Headphones className="h-3.5 w-3.5" />
              {monitorOn ? "Monitor ON — tap to stop" : "Start monitoring"}
            </button>
            <p className="mt-2 text-center text-[9px] text-muted-foreground">Direct sidetone · latencyHint: interactive · Use headphones</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
