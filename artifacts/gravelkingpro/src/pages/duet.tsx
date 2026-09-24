import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@clerk/react";
import { Copy, Link2, Loader2, Mic2, Radio, Square, Users } from "lucide-react";
import { LivePerformanceStage, type StageLyric } from "@/components/live-performance-stage";
import { alignDuetBufferTarget, DuetReviewCard } from "@/components/stage/DuetRoom";
import { downloadBlob } from "@/lib/download";
import { buildGkaMonitorGraph, createGkaMonitorContext, readReportedMonitorLatency, type GkaMonitorGraph } from "@/lib/audio/gkaMonitor";

type RoomRole = "host" | "partner";
type SignalType = "offer" | "answer" | "ice";
type IceConfig = { iceServers?: RTCIceServer[] };
type ArtistProfile = {
  artistName: string;
  hometown: string;
  avatarUrl: string | null;
};
type KaraokeTrack = {
  id: string;
  assetUrl: string;
  title: string;
  bpm: number | null;
  duration: number;
  uploaderArtistName: string;
};
type TimedLyricLine = {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
};
type SyncMessage =
  | { kind: "buffer-ready" }
  | { kind: "ready" }
  | { kind: "clock-probe"; t0: number }
  | { kind: "clock-response"; t0: number; t1: number; t2: number }
  | { kind: "start"; targetHostTime: number }
  | { kind: "review-start"; targetHostTime: number }
  | { kind: "community-track"; track: KaraokeTrack; lines: TimedLyricLine[] };

const ROOM_ID_LENGTH = 8;
const PING_MAGIC = 0x042c;
const DUET_HANDSHAKE_TIMEOUT_MS = 45_000;

function newRoomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, ROOM_ID_LENGTH).toUpperCase();
}

function audioContext(): AudioContext {
  return new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
}

function isSignalType(value: unknown): value is SignalType {
  return value === "offer" || value === "answer" || value === "ice";
}

export default function DuetRoom() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [roomId, setRoomId] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("room");
    return fromUrl?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || newRoomId();
  });
  const [roomInput, setRoomInput] = useState(roomId);
  const [joined, setJoined] = useState(false);
  const [role, setRole] = useState<RoomRole | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [trackName, setTrackName] = useState("");
  const [duration, setDuration] = useState(0);
  const [bufferDecoded, setBufferDecoded] = useState(false);
  const [remoteBufferReady, setRemoteBufferReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Create a room or join a partner.");
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [localMicAnalyser, setLocalMicAnalyser] = useState<AnalyserNode | null>(null);
  const [remoteMicAnalyser, setRemoteMicAnalyser] = useState<AnalyserNode | null>(null);
  const [monitorLatency, setMonitorLatency] = useState<{ baseLatencyMs: number | null; outputLatencyMs: number | null } | null>(null);
  const [localProfile, setLocalProfile] = useState<ArtistProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<ArtistProfile | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<KaraokeTrack[]>([]);
  const [selectedCommunityTrack, setSelectedCommunityTrack] = useState<KaraokeTrack | null>(null);
  const [communityLines, setCommunityLines] = useState<TimedLyricLine[]>([]);
  const [communityLyrics, setCommunityLyrics] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadBpm, setUploadBpm] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [takeRecording, setTakeRecording] = useState(false);
  const [localTakeBlob, setLocalTakeBlob] = useState<Blob | null>(null);
  const [localTakeUrl, setLocalTakeUrl] = useState<string | null>(null);
  const [savingTake, setSavingTake] = useState(false);
  const [handshakeState, setHandshakeState] = useState<"idle" | "joining" | "waiting" | "connecting" | "connected">("idle");

  const { current: peerId } = useRef(crypto.randomUUID());
  const roomRef = useRef(roomId);
  const roleRef = useRef<RoomRole | null>(null);
  const remotePeerRef = useRef<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackStartContextTimeRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const localMonitorGraphRef = useRef<GkaMonitorGraph | null>(null);
  const fallbackMonitorNodesRef = useRef<AudioNode[]>([]);
  const remoteMicStreamIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pingTimerRef = useRef<number | null>(null);
  const pingSequenceRef = useRef(0);
  const sentPingsRef = useRef(new Map<number, number>());
  const rttHalfRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const localReadyRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const remoteBufferReadyRef = useRef(false);
  const scheduledRef = useRef(false);
  const takeRecorderRef = useRef<MediaRecorder | null>(null);
  const takeChunksRef = useRef<Blob[]>([]);
  const takeStartTimerRef = useRef<number | null>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const trackFileRef = useRef<File | null>(null);
  const reviewingRef = useRef(false);
  const handshakeTimerRef = useRef<number | null>(null);
  const handshakeAttemptRef = useRef(0);
  const joinAbortRef = useRef<AbortController | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/user/profile", { credentials: "include" })
        .then((response) => response.ok ? response.json() as Promise<{ profile: ArtistProfile }> : null)
        .catch(() => null),
      fetch("/api/karaoke/tracks", { credentials: "include" })
        .then((response) => response.ok ? response.json() as Promise<{ tracks: KaraokeTrack[] }> : null)
        .catch(() => null),
      fetch("/api/duet/ice-config", { credentials: "include" })
        .then((response) => response.ok ? response.json() as Promise<IceConfig> : null)
        .catch(() => null),
    ]).then(([profileData, libraryData, iceData]) => {
      if (profileData?.profile) setLocalProfile(profileData.profile);
      if (libraryData?.tracks) setLibraryTracks(libraryData.tracks);
      if (iceData?.iceServers?.length) iceServersRef.current = iceData.iceServers;
    });
  }, []);

  useEffect(() => {
    if (!localTakeBlob) {
      setLocalTakeUrl(null);
      return;
    }
    const url = URL.createObjectURL(localTakeBlob);
    setLocalTakeUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localTakeBlob]);

  const requestHeaders = useCallback(async (json = true): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const clearHandshakeWatchdog = useCallback(() => {
    if (handshakeTimerRef.current !== null) {
      window.clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = null;
    }
  }, []);

  const abortHandshake = useCallback((reason: "cancelled" | "timeout" | "expired" | "failed" = "cancelled") => {
    const room = roomRef.current;
    handshakeAttemptRef.current += 1;
    clearHandshakeWatchdog();
    joinAbortRef.current?.abort();
    joinAbortRef.current = null;
    streamRef.current?.close();
    streamRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceCandidatesRef.current = [];
    remotePeerRef.current = null;
    roleRef.current = null;
    setJoined(false);
    setRole(null);
    setPeerConnected(false);
    setChannelOpen(false);
    setPartnerProfile(null);
    setRemoteBufferReady(false);
    remoteBufferReadyRef.current = false;
    setRemoteReady(false);
    remoteReadyRef.current = false;
    setLocalReady(false);
    localReadyRef.current = false;
    setHandshakeState("idle");
    setSyncStatus("Create a room or join a partner.");
    if (window.location.pathname !== "/duet") window.history.replaceState({}, "", "/duet");
    if (room) {
      void requestHeaders().then((headers) => fetch(`/api/duet/room/${encodeURIComponent(room)}/leave`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ peerId }),
      })).catch(() => {});
    }
    if (reason === "timeout") {
      toast({
        title: "Connection timed out. Partner did not respond or network blocked the handshake.",
        variant: "destructive",
      });
    } else if (reason === "expired") {
      toast({
        title: "This room session has expired. Start a new session.",
        variant: "destructive",
      });
    }
  }, [clearHandshakeWatchdog, peerId, requestHeaders, toast]);

  const beginHandshakeWatchdog = useCallback((state: "joining" | "waiting" | "connecting") => {
    clearHandshakeWatchdog();
    const attempt = ++handshakeAttemptRef.current;
    setHandshakeState(state);
    handshakeTimerRef.current = window.setTimeout(() => {
      if (handshakeAttemptRef.current === attempt && !peerConnected) abortHandshake("timeout");
    }, DUET_HANDSHAKE_TIMEOUT_MS);
    return attempt;
  }, [abortHandshake, clearHandshakeWatchdog, peerConnected]);

  const sendSignal = useCallback(async (type: SignalType, payload: unknown) => {
    const target = remotePeerRef.current;
    if (!target) return;
    await fetch(`/api/duet/room/${encodeURIComponent(roomRef.current)}/signal`, {
      method: "POST",
      headers: await requestHeaders(),
      credentials: "include",
      body: JSON.stringify({ fromPeerId: peerId, toPeerId: target, type, payload }),
    });
  }, [peerId, requestHeaders]);

  const sendControl = useCallback((message: SyncMessage) => {
    const channel = dataChannelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(message));
  }, []);

  const ensureLocalMic = useCallback(async (): Promise<MediaStream | null> => {
    if (micStreamRef.current) return micStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          channelCount: 1,
          sampleRate: 48000,
        } as MediaTrackConstraints,
      });
      const ctx = micContextRef.current ?? createGkaMonitorContext();
      micContextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      micStreamRef.current = stream;
      try {
        const monitor = await buildGkaMonitorGraph(ctx, stream, { saturation: 0.04, subharmonic: 0.025 }, (message) => {
          setSyncStatus(message);
        });
        localMonitorGraphRef.current = monitor;
        setLocalMicAnalyser(monitor.analyser);
        setMonitorLatency(monitor.reportedLatency);
      } catch (cause) {
        // Keep WebRTC and mic-level visuals available in browsers without AudioWorklet support.
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        fallbackMonitorNodesRef.current = [source, analyser];
        setLocalMicAnalyser(analyser);
        setMonitorLatency(readReportedMonitorLatency(ctx));
        setSyncStatus(`GKA monitoring is unavailable; duet mic visuals remain active. ${cause instanceof Error ? cause.message : ""}`);
      }
      return stream;
    } catch {
      // Microphone visuals are optional; the synchronized backing track can still play.
      return null;
    }
  }, []);

  const attachRemoteMic = useCallback((stream: MediaStream) => {
    if (remoteMicStreamIdRef.current === stream.id) return;
    const ctx = micContextRef.current ?? createGkaMonitorContext();
    micContextRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    remoteMicStreamIdRef.current = stream.id;
    setRemoteMicAnalyser(analyser);
  }, []);

  const stopLocalTake = useCallback(() => {
    const recorder = takeRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    takeRecorderRef.current = null;
    setTakeRecording(false);
  }, []);

  const startLocalTake = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") return;
    stopLocalTake();
    takeChunksRef.current = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) takeChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(takeChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) setLocalTakeBlob(blob);
      };
      recorder.start(750);
      takeRecorderRef.current = recorder;
      setLocalTakeBlob(null);
      setTakeRecording(true);
    } catch {
      setSyncStatus("Your browser could not open an in-memory take recorder.");
    }
  }, [stopLocalTake]);

  const scheduleReviewAudio = useCallback((targetPerformanceMs: number) => {
    const audio = reviewAudioRef.current;
    if (!audio) return;
    const wait = Math.max(0, targetPerformanceMs - performance.now());
    window.setTimeout(() => {
      if (!reviewingRef.current) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }, wait);
  }, []);

  const scheduleTrack = useCallback((targetPerformanceMs: number, review = false) => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const ctx = contextRef.current ?? audioContext();
    contextRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    sourceRef.current?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const delaySeconds = Math.max(0, targetPerformanceMs - performance.now()) / 1000;
    const startAt = ctx.currentTime + delaySeconds;
    source.start(startAt);
    source.onended = () => {
      stopLocalTake();
      if (reviewingRef.current) {
        reviewingRef.current = false;
        reviewAudioRef.current?.pause();
      }
      playbackStartContextTimeRef.current = null;
      playbackAnalyserRef.current = null;
      scheduledRef.current = false;
      setPlaybackPosition(0);
      setIsPlaying(false);
    };
    sourceRef.current = source;
    playbackAnalyserRef.current = analyser;
    playbackStartContextTimeRef.current = startAt;
    scheduledRef.current = true;
    setPlaybackPosition(0);
    setIsPlaying(true);
    if (review) {
      reviewingRef.current = true;
      scheduleReviewAudio(targetPerformanceMs);
    } else {
      takeStartTimerRef.current = window.setTimeout(() => startLocalTake(), Math.max(0, targetPerformanceMs - performance.now()));
    }
    setSyncStatus("Both singers are locked. Playback is synchronized.");
  }, [scheduleReviewAudio, startLocalTake, stopLocalTake]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      const ctx = contextRef.current;
      const startAt = playbackStartContextTimeRef.current;
      if (ctx && startAt != null) {
        setPlaybackPosition(Math.max(0, ctx.currentTime - startAt));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const maybeScheduleHostStart = useCallback(() => {
    if (
      roleRef.current !== "host" ||
      !localReadyRef.current ||
      !remoteReadyRef.current ||
      !bufferRef.current ||
      !remoteBufferReadyRef.current ||
      scheduledRef.current
    ) return;
    const targetHostTime = performance.now() + 5000 + rttHalfRef.current;
    sendControl({ kind: "start", targetHostTime });
    scheduleTrack(targetHostTime);
    setSyncStatus("Starting both tracks in five seconds…");
  }, [scheduleTrack, sendControl]);

  const startPingLoop = useCallback(() => {
    if (pingTimerRef.current != null) return;
    const tick = () => {
      const channel = dataChannelRef.current;
      if (channel?.readyState === "open") {
        const sequence = ((roleRef.current === "partner" ? 0x8000 : 0) | (pingSequenceRef.current++ & 0x7fff)) & 0xffff;
        const packet = new Uint8Array(4);
        packet[0] = (PING_MAGIC >> 8) & 0xff;
        packet[1] = PING_MAGIC & 0xff;
        packet[2] = (sequence >> 8) & 0xff;
        packet[3] = sequence & 0xff;
        sentPingsRef.current.set(sequence, performance.now());
        channel.send(packet);
        sendControl({ kind: "clock-probe", t0: performance.now() });
      }
      pingTimerRef.current = window.setTimeout(tick, 200);
    };
    tick();
  }, [sendControl]);

  const attachDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      setChannelOpen(true);
      startPingLoop();
      if (bufferRef.current) sendControl({ kind: "buffer-ready" });
      setSyncStatus("Direct duet link ready. Load the same backing track on both devices.");
    };
    channel.onclose = () => {
      setChannelOpen(false);
      if (pingTimerRef.current != null) window.clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    };
    channel.onerror = () => setSyncStatus("The direct link reported an error. Try rejoining the room.");
    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
        const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new Uint8Array(event.data.buffer);
        if (bytes.length !== 4 || bytes[0] !== (PING_MAGIC >> 8) || bytes[1] !== (PING_MAGIC & 0xff)) return;
        const sequence = (bytes[2] << 8) | bytes[3];
        const sentAt = sentPingsRef.current.get(sequence);
        if (sentAt != null) {
          const rtt = performance.now() - sentAt;
          sentPingsRef.current.delete(sequence);
          rttHalfRef.current = rtt / 2;
          setRttMs(Math.round(rtt));
        } else {
          channel.send(bytes.buffer as ArrayBuffer);
        }
        return;
      }
      let message: SyncMessage;
      try { message = JSON.parse(String(event.data)) as SyncMessage; } catch { return; }
      if (message.kind === "buffer-ready") {
        remoteBufferReadyRef.current = true;
        setRemoteBufferReady(true);
        setSyncStatus("Both backing tracks are decoded. Press Ready when you are set.");
      } else if (message.kind === "ready") {
        remoteReadyRef.current = true;
        setRemoteReady(true);
        maybeScheduleHostStart();
      } else if (message.kind === "clock-probe") {
        const t1 = performance.now();
        channel.send(JSON.stringify({ kind: "clock-response", t0: message.t0, t1, t2: performance.now() }));
      } else if (message.kind === "clock-response") {
        const t3 = performance.now();
        const offset = ((message.t1 - message.t0) + (message.t2 - t3)) / 2;
        clockOffsetRef.current = offset;
        setClockOffsetMs(Math.round(offset));
      } else if (message.kind === "start") {
        const alignment = alignDuetBufferTarget(message.targetHostTime, performance.now(), clockOffsetRef.current);
        scheduleTrack(alignment.localTargetTimeMs);
      } else if (message.kind === "review-start") {
        const alignment = alignDuetBufferTarget(message.targetHostTime, performance.now(), clockOffsetRef.current);
        scheduleTrack(alignment.localTargetTimeMs, true);
      } else if (message.kind === "community-track") {
        setSelectedCommunityTrack(message.track);
        setCommunityLines(message.lines);
        setCommunityLyrics(message.lines.map((line) => line.text).join("\n"));
        setSyncStatus(`Community track selected: ${message.track.title}. Load it locally to join playback.`);
      }
    };
  }, [maybeScheduleHostStart, scheduleTrack, sendControl, startPingLoop]);

  const createPeerConnection = useCallback(async (remotePeerId: string) => {
    if (pcRef.current) return;
    const attempt = handshakeAttemptRef.current;
    await ensureLocalMic();
    if (handshakeAttemptRef.current !== attempt) return;
    remotePeerRef.current = remotePeerId;
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;
    for (const track of micStreamRef.current?.getTracks() ?? []) {
      pc.addTrack(track, micStreamRef.current!);
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal("ice", event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      if (stream) attachRemoteMic(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearHandshakeWatchdog();
        setHandshakeState("connected");
        setPeerConnected(true);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        setPeerConnected(false);
        if (handshakeAttemptRef.current === attempt) abortHandshake("failed");
      }
    };
    pc.ondatachannel = (event) => attachDataChannel(event.channel);
    if (roleRef.current === "host") {
      const channel = pc.createDataChannel("duet-sync", { ordered: false, maxRetransmits: 0 });
      attachDataChannel(channel);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal("offer", offer);
    }
  }, [abortHandshake, attachDataChannel, attachRemoteMic, clearHandshakeWatchdog, ensureLocalMic, sendSignal]);

  const handleSignal = useCallback(async (message: { fromPeerId?: string; type?: unknown; payload?: unknown }) => {
    if (!message.fromPeerId || !isSignalType(message.type)) return;
    await createPeerConnection(message.fromPeerId);
    const pc = pcRef.current;
    if (!pc) return;
    if (message.type === "offer") {
      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      for (const candidate of pendingIceCandidatesRef.current.splice(0)) {
        await pc.addIceCandidate(candidate);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal("answer", answer);
    } else if (message.type === "answer") {
      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      for (const candidate of pendingIceCandidatesRef.current.splice(0)) {
        await pc.addIceCandidate(candidate);
      }
    } else if (message.type === "ice" && message.payload) {
      if (!pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(message.payload as RTCIceCandidateInit);
        return;
      }
      await pc.addIceCandidate(message.payload as RTCIceCandidateInit);
    }
  }, [createPeerConnection, sendSignal]);

  const connectToRoom = useCallback(async () => {
    const nextRoom = roomInput.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!nextRoom) return;
    const attempt = beginHandshakeWatchdog("joining");
    const controller = new AbortController();
    joinAbortRef.current = controller;
    setSyncStatus("Joining room…");
    try {
      const response = await fetch(`/api/duet/room/${encodeURIComponent(nextRoom)}/join`, {
        method: "POST",
        headers: await requestHeaders(),
        credentials: "include",
        body: JSON.stringify({ peerId }),
        signal: controller.signal,
      });
      if (handshakeAttemptRef.current !== attempt) return;
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        code?: string;
        role?: RoomRole;
        otherPeerId?: string | null;
        profile?: ArtistProfile | null;
        otherPeerProfile?: ArtistProfile | null;
      };
      if (response.status === 410 || data.code === "ROOM_EXPIRED") {
        abortHandshake("expired");
        return;
      }
      if (!response.ok || !data.role) {
        abortHandshake();
        setSyncStatus(data.error || "Could not join this room.");
        toast({ title: "Duet room unavailable", description: data.error || "Try a new room.", variant: "destructive" });
        return;
      }
      roomRef.current = nextRoom;
      roleRef.current = data.role;
      setRoomId(nextRoom);
      setRole(data.role);
      setLocalProfile(data.profile ?? localProfile);
      setPartnerProfile(data.otherPeerProfile ?? null);
      setJoined(true);
      window.history.replaceState({}, "", `/duet?room=${encodeURIComponent(nextRoom)}`);
      const stream = new EventSource(`/api/duet/room/${encodeURIComponent(nextRoom)}/events?peerId=${encodeURIComponent(peerId)}`);
      streamRef.current = stream;
      setHandshakeState(data.otherPeerId ? "connecting" : "waiting");
      setSyncStatus(data.otherPeerId ? "Connecting to partner…" : `You are the ${data.role}. Share the room link with your duet partner.`);
      stream.addEventListener("peer-joined", (event) => {
        const joinedPeer = JSON.parse((event as MessageEvent).data) as { peerId?: string; profile?: ArtistProfile | null };
        if (joinedPeer.peerId) {
          remotePeerRef.current = joinedPeer.peerId;
          setPartnerProfile(joinedPeer.profile ?? null);
          setHandshakeState("connecting");
          setSyncStatus("Connecting to partner…");
          void createPeerConnection(joinedPeer.peerId);
        }
      });
      stream.addEventListener("signal", (event) => {
        void handleSignal(JSON.parse((event as MessageEvent).data) as { fromPeerId?: string; type?: unknown; payload?: unknown });
      });
      stream.addEventListener("room-expired", () => abortHandshake("expired"));
      stream.addEventListener("peer-left", () => {
        setPeerConnected(false);
        setPartnerProfile(null);
        setChannelOpen(false);
        setRemoteBufferReady(false);
        remoteBufferReadyRef.current = false;
        setRemoteReady(false);
        remoteReadyRef.current = false;
        beginHandshakeWatchdog("waiting");
        setSyncStatus("Your partner left the room.");
        pcRef.current?.close();
        pcRef.current = null;
        pendingIceCandidatesRef.current = [];
      });
      if (data.otherPeerId) {
        remotePeerRef.current = data.otherPeerId;
        setHandshakeState("connecting");
        setSyncStatus("Connecting to partner…");
        await createPeerConnection(data.otherPeerId);
      }
    } catch (cause) {
      if (controller.signal.aborted || handshakeAttemptRef.current !== attempt) return;
      abortHandshake();
      const message = cause instanceof Error ? cause.message : "Could not join this room.";
      toast({ title: "Duet room unavailable", description: message, variant: "destructive" });
    } finally {
      if (joinAbortRef.current === controller) joinAbortRef.current = null;
    }
  }, [abortHandshake, beginHandshakeWatchdog, createPeerConnection, handleSignal, localProfile, peerId, requestHeaders, roomInput, toast]);

  const loadTrack = useCallback(async (file: File | null) => {
    if (!file) return;
    setLoadingTrack(true);
    setBufferDecoded(false);
    setLocalReady(false);
    localReadyRef.current = false;
    scheduledRef.current = false;
    try {
      const ctx = contextRef.current ?? audioContext();
      contextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const decoded = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
      bufferRef.current = decoded;
      trackFileRef.current = file;
      setTrackName(file.name);
      setDuration(decoded.duration);
      setBufferDecoded(true);
      if (dataChannelRef.current?.readyState === "open") sendControl({ kind: "buffer-ready" });
      setSyncStatus(remoteBufferReadyRef.current ? "Both backing tracks are decoded. Press Ready." : "Track decoded locally. Waiting for your partner's decoded buffer.");
    } catch {
      bufferRef.current = null;
      setSyncStatus("That audio file could not be decoded in this browser.");
      toast({ title: "Track decode failed", description: "Choose a WAV, MP3, M4A, or WebM backing track.", variant: "destructive" });
    } finally {
      setLoadingTrack(false);
    }
  }, [sendControl, toast]);

  const selectCommunityTrack = useCallback(async (track: KaraokeTrack) => {
    setSelectedCommunityTrack(track);
    try {
      const response = await fetch(track.assetUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Track download failed");
      const blob = await response.blob();
      await loadTrack(new File([blob], `${track.title}.audio`, { type: blob.type || "audio/mpeg" }));
      setTrackName(track.title);
      setSyncStatus(`Loaded ${track.title}. Both singers should choose the same community track.`);
    } catch {
      toast({ title: "Community track unavailable", description: "The public audio asset could not be loaded.", variant: "destructive" });
    }
  }, [loadTrack, toast]);

  const broadcastCommunityTrack = useCallback(async () => {
    if (!selectedCommunityTrack || !channelOpen) return;
    let lines = communityLines;
    if (communityLyrics.trim()) {
      const form = new FormData();
      form.append("lyrics", communityLyrics);
      form.append("durationMs", String(selectedCommunityTrack.duration * 1000));
      const response = await fetch("/api/karaoke/transcribe", { method: "POST", body: form, credentials: "include" });
      if (response.ok) {
        const data = await response.json() as { lines?: TimedLyricLine[] };
        lines = data.lines ?? [];
        setCommunityLines(lines);
      }
    }
    sendControl({ kind: "community-track", track: selectedCommunityTrack, lines });
    toast({ title: "Track shared", description: "The selected community track and lyric timestamps were sent to your partner." });
  }, [channelOpen, communityLines, communityLyrics, selectedCommunityTrack, sendControl, toast]);

  const uploadCommunityTrack = useCallback(async () => {
    if (!uploadFile || !uploadTitle.trim()) return;
    setUploadingTrack(true);
    try {
      const form = new FormData();
      form.append("audio", uploadFile);
      form.append("title", uploadTitle.trim());
      if (uploadBpm.trim()) form.append("bpm", uploadBpm.trim());
      const response = await fetch("/api/karaoke/tracks", { method: "POST", body: form, credentials: "include" });
      const data = await response.json().catch(() => ({})) as { track?: KaraokeTrack; error?: string };
      if (!response.ok || !data.track) throw new Error(data.error || "Upload failed");
      setLibraryTracks((current) => [data.track!, ...current]);
      setUploadTitle("");
      setUploadBpm("");
      setUploadFile(null);
      toast({ title: "Track added to the public library", description: "It is now available to all duet rooms." });
    } catch (error) {
      toast({ title: "Track upload failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setUploadingTrack(false);
    }
  }, [uploadBpm, uploadFile, uploadTitle, toast]);

  const setReady = useCallback(() => {
    if (!bufferRef.current || !remoteBufferReadyRef.current || !channelOpen) return;
    localReadyRef.current = true;
    setLocalReady(true);
    sendControl({ kind: "ready" });
    setSyncStatus(remoteReadyRef.current ? "Both singers are ready. Host is scheduling playback." : "Ready sent. Waiting for your partner.");
    maybeScheduleHostStart();
  }, [channelOpen, maybeScheduleHostStart, sendControl]);

  const stopPlayback = useCallback(() => {
    if (takeStartTimerRef.current != null) window.clearTimeout(takeStartTimerRef.current);
    takeStartTimerRef.current = null;
    stopLocalTake();
    reviewingRef.current = false;
    reviewAudioRef.current?.pause();
    try { sourceRef.current?.stop(); } catch { /* already ended */ }
    sourceRef.current = null;
    playbackAnalyserRef.current = null;
    playbackStartContextTimeRef.current = null;
    scheduledRef.current = false;
    setPlaybackPosition(0);
    setIsPlaying(false);
    setLocalReady(false);
    localReadyRef.current = false;
    setSyncStatus("Playback stopped. Both singers can ready again.");
  }, [stopLocalTake]);

  const playReview = useCallback(() => {
    if (!localTakeBlob || !bufferRef.current || !channelOpen) return;
    if (roleRef.current === "host") {
      const targetHostTime = performance.now() + 2500 + rttHalfRef.current;
      sendControl({ kind: "review-start", targetHostTime });
      scheduleTrack(targetHostTime, true);
      setSyncStatus("Review playback is synchronized for both singers.");
    } else {
      setSyncStatus("The host controls synchronized review playback.");
    }
  }, [channelOpen, localTakeBlob, scheduleTrack, sendControl]);

  const saveReviewToVault = useCallback(async () => {
    if (!localTakeBlob || !trackFileRef.current) return;
    setSavingTake(true);
    try {
      const form = new FormData();
      form.append("tracks", trackFileRef.current, trackFileRef.current.name);
      form.append("tracks", localTakeBlob, "duet-vocal-take.webm");
      form.append("arrangement", "layer");
      // Saving a duet mix is an explicit user-owned audio submission to the
      // studio ingest route, which requires the ownership warranty.
      form.append("author_assertion", "true");
      const mixResponse = await fetch("/api/kernel/studio-mix", { method: "POST", body: form, credentials: "include" });
      if (!mixResponse.ok) throw new Error((await mixResponse.text().catch(() => "")) || `Mixdown failed (${mixResponse.status})`);
      const vaultForm = new FormData();
      vaultForm.append("audio", await mixResponse.blob(), "duet-performance.wav");
      vaultForm.append("title", `${trackName || "Duet"} — duet performance`);
      const vaultResponse = await fetch("/api/duet/review", { method: "POST", body: vaultForm, credentials: "include" });
      const result = await vaultResponse.json().catch(() => ({})) as { error?: string };
      if (!vaultResponse.ok) throw new Error(result.error || `Vault save failed (${vaultResponse.status})`);
      toast({ title: "Saved to Vault", description: "The combined backing and vocal performance is private to your library." });
    } catch (error) {
      toast({ title: "Could not save review", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingTake(false);
    }
  }, [localTakeBlob, toast, trackName]);

  const downloadTake = useCallback(() => {
    if (!localTakeBlob) return;
    const safeName = (trackName || "duet-take")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "duet-take";
    downloadBlob(localTakeBlob, `${safeName}.webm`);
  }, [localTakeBlob, trackName]);

  const leaveRoom = useCallback(() => {
    handshakeAttemptRef.current += 1;
    clearHandshakeWatchdog();
    joinAbortRef.current?.abort();
    joinAbortRef.current = null;
    void fetch(`/api/duet/room/${encodeURIComponent(roomRef.current)}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ peerId }),
    });
    streamRef.current?.close();
    pcRef.current?.close();
    if (takeStartTimerRef.current != null) window.clearTimeout(takeStartTimerRef.current);
    takeStartTimerRef.current = null;
    stopLocalTake();
    reviewAudioRef.current?.pause();
    try { sourceRef.current?.stop(); } catch { /* already ended */ }
    for (const node of localMonitorGraphRef.current?.nodes ?? fallbackMonitorNodesRef.current) {
      try { node.disconnect(); } catch { /* already detached */ }
    }
    localMonitorGraphRef.current = null;
    fallbackMonitorNodesRef.current = [];
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    void micContextRef.current?.close();
    if (pingTimerRef.current != null) window.clearTimeout(pingTimerRef.current);
    streamRef.current = null;
    pcRef.current = null;
    dataChannelRef.current = null;
    micStreamRef.current = null;
    micContextRef.current = null;
    remoteMicStreamIdRef.current = null;
    pendingIceCandidatesRef.current = [];
    playbackAnalyserRef.current = null;
    playbackStartContextTimeRef.current = null;
    setLocalMicAnalyser(null);
    setRemoteMicAnalyser(null);
    setMonitorLatency(null);
    setPlaybackPosition(0);
    setJoined(false);
    setRole(null);
    setPeerConnected(false);
    setChannelOpen(false);
    setLocalReady(false);
    setRemoteReady(false);
    setRemoteBufferReady(false);
    localReadyRef.current = false;
    remoteReadyRef.current = false;
    remoteBufferReadyRef.current = false;
    scheduledRef.current = false;
    setIsPlaying(false);
    setSyncStatus("Create a room or join a partner.");
    setHandshakeState("idle");
  }, [clearHandshakeWatchdog, peerId, stopLocalTake]);

  useEffect(() => () => leaveRoom(), [leaveRoom]);

  const roomLink = `${window.location.origin}${import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`}stage/duet/${encodeURIComponent(roomId)}`;
  const readyEnabled = joined && channelOpen && bufferDecoded && remoteBufferReady && !localReady && !isPlaying;
  const stageLyrics: StageLyric[] = communityLines
    .map((line) => ({
      id: line.id,
      text: line.text,
      startTimeMs: line.startTimeMs,
      endTimeMs: Math.max(line.startTimeMs, line.endTimeMs),
    }))
    .filter((line) => line.text.trim() && line.endTimeMs > line.startTimeMs);
  const localIsHost = role === "host";
  const monitorLatencyLabel = monitorLatency
    ? `Mic monitor · base ${monitorLatency.baseLatencyMs == null ? "unavailable" : `${monitorLatency.baseLatencyMs.toFixed(1)} ms`} · output ${monitorLatency.outputLatencyMs == null ? "unavailable" : `${monitorLatency.outputLatencyMs.toFixed(1)} ms`}`
    : "Mic monitor latency unavailable";

  if (isPlaying) {
    return (
      <>
        <audio ref={reviewAudioRef} src={localTakeUrl ?? undefined} preload="auto" className="hidden" />
        <LivePerformanceStage
          title={trackName || "Duet Room"}
          subtitle={`Two-person synchronized room · ${monitorLatencyLabel}`}
          trackName={trackName}
          isPlaying={isPlaying}
          currentTimeSec={playbackPosition}
          durationSec={duration}
          lyrics={stageLyrics}
          backingAnalyser={playbackAnalyserRef.current}
          onExit={stopPlayback}
          onStop={stopPlayback}
          performers={[
            {
              id: localIsHost ? "host" : "partner",
              label: localProfile?.artistName || (localIsHost ? "Host" : "Partner"),
              name: localProfile?.artistName || (localIsHost ? "Host" : "Partner"),
              avatarUrl: localProfile?.avatarUrl,
              accent: localIsHost ? "gold" : "violet",
              analyser: localMicAnalyser,
              status: localMicAnalyser ? (takeRecording ? "Recording in RAM" : "Live mic") : "Mic unavailable",
            },
            {
              id: localIsHost ? "partner" : "host",
              label: partnerProfile?.artistName || (localIsHost ? "Partner" : "Host"),
              name: partnerProfile?.artistName || (localIsHost ? "Partner" : "Host"),
              avatarUrl: partnerProfile?.avatarUrl,
              accent: localIsHost ? "violet" : "gold",
              analyser: remoteMicAnalyser,
              status: remoteMicAnalyser ? "Live mic" : "Waiting for mic",
            },
          ]}
        />
      </>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-8">
        <audio ref={reviewAudioRef} src={localTakeUrl ?? undefined} preload="auto" className="hidden" />
        {handshakeState !== "idle" && handshakeState !== "connected" && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Duet connection in progress"
          >
            <div className="w-full max-w-sm rounded-3xl border border-violet-300/30 bg-zinc-950 p-6 text-center shadow-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">Duet connection</p>
              <h2 className="mt-2 text-xl font-black text-white">
                {handshakeState === "joining" ? "Joining…" : handshakeState === "waiting" ? "Waiting for Partner…" : "Connecting to Partner…"}
              </h2>
              <p className="mt-2 text-sm text-white/60">You can cancel at any time without stopping your local backing track, teleprompter, or microphone.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-5 min-h-11 w-full border-violet-300/40 text-violet-100 hover:bg-violet-300/10"
                onClick={() => abortHandshake("cancelled")}
              >
                Cancel / Back to Solo
              </Button>
            </div>
          </div>
        )}
        {localTakeBlob && !isPlaying && (
          <DuetReviewCard
            trackName={trackName}
            durationSec={duration}
            saving={savingTake}
            onPlayReview={playReview}
            onDownloadTake={downloadTake}
            onSaveToVault={() => void saveReviewToVault()}
            onRetake={() => { setLocalTakeBlob(null); stopPlayback(); }}
          />
        )}
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs uppercase tracking-[0.2em]">
            <Radio className="h-4 w-4" /> Two-person synchronized room
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Duet Room</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Load the same backing track on both devices, establish a direct peer link, and start together on a shared clock.
            The room never carries audio; it only relays SDP and ICE setup messages.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {[{ label: "You", profile: localProfile }, { label: "Partner", profile: partnerProfile }].map(({ label, profile }) => {
            const name = profile?.artistName || (label === "You" ? "Guest singer" : peerConnected ? "Partner connected" : "Waiting for partner");
            const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/40 p-4">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={name} className="h-12 w-12 rounded-full border border-amber-500/30 object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 font-semibold text-amber-300">
                    {initials || "GK"}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="truncate font-semibold">{name}</div>
                  <div className="truncate text-xs text-muted-foreground">{profile?.hometown || "Artist profile"}</div>
                </div>
                <span className="ml-auto rounded-full border border-amber-500/20 px-2 py-1 text-[10px] text-amber-300">Artist</span>
              </div>
            );
          })}
        </section>

        <section className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-border/50 bg-card/40 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Room code</div>
                <div className="mt-1 font-mono text-2xl tracking-[0.18em]">{roomId}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-4 w-4" /> {joined ? `${role === "host" ? "Host" : "Partner"} · ${peerConnected ? "2/2" : "1/2"}` : "Not connected"}
              </div>
            </div>
            {!joined && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={roomInput}
                  onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                  aria-label="Duet room code"
                  className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-sm tracking-widest"
                />
                <Button onClick={() => void connectToRoom()} className="bg-amber-500 text-black hover:bg-amber-400">
                  Join room
                </Button>
              </div>
            )}
            {joined && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(roomLink)}>
                  <Copy className="mr-2 h-4 w-4" /> Copy invite link
                </Button>
                <Button variant="ghost" onClick={leaveRoom}>Leave room</Button>
              </div>
            )}
            <div className="rounded-lg bg-black/20 px-3 py-2 text-xs text-muted-foreground">{syncStatus}</div>
            <div className="rounded-lg border border-border/40 bg-black/10 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/80">Interactive GKA mic monitoring</p>
              <p className="mt-1">The AudioWorklet processes audio in 128-frame render quanta when supported. Use headphones to prevent feedback.</p>
              <p className="mt-1">
                Browser-reported latency: base {monitorLatency?.baseLatencyMs == null ? "unavailable" : `${monitorLatency.baseLatencyMs.toFixed(1)} ms`}
                {" · "}output {monitorLatency?.outputLatencyMs == null ? "unavailable" : `${monitorLatency.outputLatencyMs.toFixed(1)} ms`}
              </p>
              <p className="mt-1">These browser values exclude microphone, driver, and hardware round-trip latency; actual monitoring delay varies by device.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/40 p-5 text-sm space-y-3 min-w-[210px]">
            <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-amber-400" /> Share this room</div>
            <div className="break-all text-xs text-muted-foreground">{roomLink}</div>
            <div className="text-xs text-muted-foreground">Room capacity is strictly capped at Host + Partner.</div>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-5">
          <div>
            <h2 className="font-semibold">Community karaoke library</h2>
            <p className="text-xs text-muted-foreground">Public backing tracks persist for every session. Select one, optionally paste lyrics for deterministic timestamps, then share it with your partner.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Available tracks</label>
              <select
                value={selectedCommunityTrack?.id ?? ""}
                onChange={(event) => {
                  const track = libraryTracks.find((candidate) => candidate.id === event.target.value);
                  if (track) void selectCommunityTrack(track);
                }}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <option value="">Choose a public backing track</option>
                {libraryTracks.map((track) => (
                  <option key={track.id} value={track.id}>{track.title} · {track.uploaderArtistName} · {Math.round(track.duration)}s</option>
                ))}
              </select>
              {selectedCommunityTrack && <p className="text-xs text-amber-300">{selectedCommunityTrack.title} · {selectedCommunityTrack.bpm ? `${selectedCommunityTrack.bpm} BPM · ` : ""}{communityLines.length} timed lines</p>}
            </div>
            <Button variant="outline" disabled={!selectedCommunityTrack || !channelOpen} onClick={() => void broadcastCommunityTrack()}>
              Share with partner
            </Button>
          </div>
          <textarea
            value={communityLyrics}
            onChange={(event) => setCommunityLyrics(event.target.value)}
            placeholder="Optional pasted lyrics. Each non-empty line becomes a timed bar when shared."
            className="min-h-20 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
          />
          <div className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Upload title" maxLength={200} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm" />
            <input value={uploadBpm} onChange={(event) => setUploadBpm(event.target.value)} placeholder="BPM" inputMode="numeric" className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm" />
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-xs hover:border-amber-500/50">
              {uploadFile ? uploadFile.name : "Choose audio"}
              <input type="file" accept="audio/*,.m4a,.wav,.mp3,.webm" className="hidden" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button variant="secondary" disabled={!uploadFile || !uploadTitle.trim() || uploadingTrack} onClick={() => void uploadCommunityTrack()}>
            {uploadingTrack ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic2 className="mr-2 h-4 w-4" />}
            {uploadingTrack ? "Uploading…" : "Add public backing track"}
          </Button>
        </section>

        <section className="rounded-2xl border border-border/50 bg-card/40 p-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Backing track</h2>
              <p className="text-xs text-muted-foreground">The Ready button stays locked until both devices decode a local buffer.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10">
              {loadingTrack ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic2 className="mr-2 h-4 w-4" />}
              Choose audio
              <input className="hidden" type="file" accept="audio/*,.m4a,.wav,.mp3,.webm" onChange={(event) => void loadTrack(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-background/50 px-3 py-3"><div className="text-[10px] uppercase text-muted-foreground">Local buffer</div><div className="mt-1 text-sm">{bufferDecoded ? "Decoded" : "Not loaded"}</div></div>
            <div className="rounded-lg bg-background/50 px-3 py-3"><div className="text-[10px] uppercase text-muted-foreground">Partner buffer</div><div className="mt-1 text-sm">{remoteBufferReady ? "Decoded" : "Waiting"}</div></div>
            <div className="rounded-lg bg-background/50 px-3 py-3"><div className="text-[10px] uppercase text-muted-foreground">Clock link</div><div className="mt-1 text-sm">{rttMs == null ? "Measuring…" : `${rttMs} ms RTT`}</div></div>
          </div>
          {trackName && <div className="text-xs text-muted-foreground">{trackName} · {Math.round(duration)}s</div>}
        </section>

        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Double-ready trigger</h2>
              <p className="text-xs text-muted-foreground">The host schedules AudioBufferSourceNode.start() five seconds ahead with the measured half-RTT correction.</p>
            </div>
            {clockOffsetMs != null && <span className="font-mono text-[10px] text-muted-foreground">clock {clockOffsetMs}ms</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!readyEnabled} onClick={setReady} className="bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40">
              <Radio className="mr-2 h-4 w-4" /> {localReady ? "Ready sent" : "I’m ready"}
            </Button>
            {isPlaying && <Button variant="outline" onClick={() => { sourceRef.current?.stop(); setIsPlaying(false); }}><Square className="mr-2 h-4 w-4" /> Stop</Button>}
            <span className="text-xs text-muted-foreground">{remoteReady ? "Partner ready" : "Partner not ready"}</span>
          </div>
        </section>
      </div>
    </Layout>
  );
}
