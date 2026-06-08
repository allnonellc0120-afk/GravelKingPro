import { useState, useRef, useCallback, useEffect } from "react";
import { TrackState, PluginDef, PluginType, Region, TRACK_COLORS, PLUGIN_DEFAULTS } from "./types";
import { getWaveformPoints, audioBufferToWav } from "@/lib/audioKernel";
import { useToast } from "@/hooks/use-toast";

// ─── helpers ────────────────────────────────────────────────────────────────

function toAudioParamValue(key: string, raw: number): number {
  if (key === "attack" || key === "release" || key === "hold" || key === "time") return raw / 1000;
  if (key === "wet" || key === "feedback") return raw / 100;
  if (key === "pan") return raw / 100;
  if (key === "gain" || key === "makeup") return Math.pow(10, raw / 20);
  return raw;
}

// IR cache keyed by `${sampleRate}:${sizePct}:${dampPct}` — AudioBuffer is
// safe to share across BaseAudioContext instances with the same sample rate.
const _irCache = new Map<string, AudioBuffer>();

function makeIR(ctx: AudioContext, sizePct: number, dampPct: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${sizePct}:${dampPct}`;
  const hit = _irCache.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const dur = 0.4 + (sizePct / 100) * 3.5;
  const len = Math.ceil(sr * dur);
  const buf = ctx.createBuffer(2, len, sr);
  const damp = 1 + (dampPct / 100) * 5;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, damp);
  }
  _irCache.set(key, buf);
  return buf;
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 512;
  const c = new Float32Array(n);
  const k = amount * 200;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return c;
}

interface PluginNodeResult {
  input: AudioNode;
  output: AudioNode;
  audioParams: Map<string, AudioParam>;
  specialParams: Map<string, (value: number) => void>;
}

function createPluginNode(ctx: AudioContext, plugin: PluginDef): PluginNodeResult {
  const p = plugin.params;
  const ap = new Map<string, AudioParam>();
  const sp = new Map<string, (value: number) => void>();

  switch (plugin.type) {
    case "eq": {
      const b1 = ctx.createBiquadFilter(); b1.type = "lowshelf";  b1.frequency.value = p.b1f; b1.gain.value = p.b1g;
      const b2 = ctx.createBiquadFilter(); b2.type = "peaking";   b2.frequency.value = p.b2f; b2.gain.value = p.b2g; b2.Q.value = p.b2q;
      const b3 = ctx.createBiquadFilter(); b3.type = "peaking";   b3.frequency.value = p.b3f; b3.gain.value = p.b3g; b3.Q.value = p.b3q;
      const b4 = ctx.createBiquadFilter(); b4.type = "highshelf"; b4.frequency.value = p.b4f; b4.gain.value = p.b4g;
      b1.connect(b2); b2.connect(b3); b3.connect(b4);
      ap.set("b1f", b1.frequency); ap.set("b1g", b1.gain);
      ap.set("b2f", b2.frequency); ap.set("b2g", b2.gain); ap.set("b2q", b2.Q);
      ap.set("b3f", b3.frequency); ap.set("b3g", b3.gain); ap.set("b3q", b3.Q);
      ap.set("b4f", b4.frequency); ap.set("b4g", b4.gain);
      return { input: b1, output: b4, audioParams: ap, specialParams: sp };
    }
    case "compressor": {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = p.threshold; comp.ratio.value = p.ratio;
      comp.attack.value = p.attack / 1000; comp.release.value = p.release / 1000;
      comp.knee.value = p.knee;
      const mg = ctx.createGain(); mg.gain.value = Math.pow(10, p.makeup / 20);
      comp.connect(mg);
      ap.set("threshold", comp.threshold); ap.set("ratio", comp.ratio);
      ap.set("attack", comp.attack); ap.set("release", comp.release);
      ap.set("knee", comp.knee); ap.set("makeup", mg.gain);
      return { input: comp, output: mg, audioParams: ap, specialParams: sp };
    }
    case "reverb": {
      const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, p.size, p.damp);
      const dry = ctx.createGain(); dry.gain.value = 1 - p.wet / 100;
      const wet = ctx.createGain(); wet.gain.value = p.wet / 100;
      const inp = ctx.createGain(); const out = ctx.createGain();
      inp.connect(dry); inp.connect(conv); conv.connect(wet);
      dry.connect(out); wet.connect(out);
      ap.set("wet", wet.gain);
      const liveRev = { size: p.size, damp: p.damp };
      sp.set("size", v => { liveRev.size = v; conv.buffer = makeIR(ctx, liveRev.size, liveRev.damp); });
      sp.set("damp", v => { liveRev.damp = v; conv.buffer = makeIR(ctx, liveRev.size, liveRev.damp); });
      return { input: inp, output: out, audioParams: ap, specialParams: sp };
    }
    case "delay": {
      const del = ctx.createDelay(3.0); del.delayTime.value = p.time / 1000;
      const fb = ctx.createGain(); fb.gain.value = p.feedback / 100;
      const dry = ctx.createGain(); dry.gain.value = 1 - p.wet / 100;
      const wet = ctx.createGain(); wet.gain.value = p.wet / 100;
      const inp = ctx.createGain(); const out = ctx.createGain();
      del.connect(fb); fb.connect(del);
      inp.connect(dry); inp.connect(del); del.connect(wet);
      dry.connect(out); wet.connect(out);
      ap.set("time", del.delayTime); ap.set("feedback", fb.gain); ap.set("wet", wet.gain);
      return { input: inp, output: out, audioParams: ap, specialParams: sp };
    }
    case "distortion": {
      const ws = ctx.createWaveShaper();
      ws.curve = makeDistortionCurve(p.drive / 100); ws.oversample = "4x";
      const tone = ctx.createBiquadFilter(); tone.type = "lowpass";
      tone.frequency.value = 1000 + (p.tone / 100) * 18000;
      ws.connect(tone);
      sp.set("drive", v => { ws.curve = makeDistortionCurve(v / 100); });
      sp.set("tone", v => { tone.frequency.setTargetAtTime(1000 + (v / 100) * 18000, ctx.currentTime, 0.01); });
      return { input: ws, output: tone, audioParams: ap, specialParams: sp };
    }
    case "gate": {
      const gate = ctx.createDynamicsCompressor();
      gate.threshold.value = p.threshold; gate.knee.value = 0;
      gate.ratio.value = 20; gate.attack.value = 0.001;
      gate.release.value = p.release / 1000;
      ap.set("threshold", gate.threshold); ap.set("release", gate.release);
      return { input: gate, output: gate, audioParams: ap, specialParams: sp };
    }
    case "gain": {
      const g = ctx.createGain(); g.gain.value = Math.pow(10, p.gain / 20);
      ap.set("gain", g.gain);
      return { input: g, output: g, audioParams: ap, specialParams: sp };
    }
    case "pan": {
      const pn = ctx.createStereoPanner(); pn.pan.value = p.pan / 100;
      ap.set("pan", pn.pan);
      return { input: pn, output: pn, audioParams: ap, specialParams: sp };
    }
    default: { const g = ctx.createGain(); return { input: g, output: g, audioParams: ap, specialParams: sp }; }
  }
}

interface ActiveTrack {
  source: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  plugins: Map<string, PluginNodeResult>;
}

// ─── hook ───────────────────────────────────────────────────────────────────

export function useDAW() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [masterVolume, setMasterVolumeState] = useState(0.85);
  const [loop, setLoop] = useState(false);
  const [bpm] = useState(120);
  const [masterPlugins, setMasterPlugins] = useState<PluginDef[]>([
    { id: "m-eq",  type: "eq",  enabled: false, params: { ...PLUGIN_DEFAULTS.eq } },
    { id: "m-lim", type: "compressor", enabled: true,  params: { threshold: -1, ratio: 20, attack: 0, release: 100, knee: 0, makeup: 0 } },
  ]);

  const ctxRef         = useRef<AudioContext | null>(null);
  const activeTracksRef = useRef<Map<string, ActiveTrack>>(new Map());
  const masterGainRef  = useRef<GainNode | null>(null);
  const masterAnalRef  = useRef<AnalyserNode | null>(null);
  const masterPlugNR   = useRef<Map<string, PluginNodeResult>>(new Map());
  const rafRef         = useRef<number>(0);
  const playStartRef   = useRef<number>(0);
  const offsetRef      = useRef<number>(0);
  const isPlayingRef   = useRef(false);
  const loopRef        = useRef(false);
  const tracksRef      = useRef<TrackState[]>([]);
  const masterVolRef   = useRef(0.85);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  useEffect(() => { masterVolRef.current = masterVolume; }, [masterVolume]);

  const getCtx = (): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  };

  const maxDuration = tracks.reduce((m, t) => Math.max(m, t.duration), 0);

  // ── teardown ──
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    activeTracksRef.current.forEach(at => {
      try { at.source.stop(); } catch {}
    });
    activeTracksRef.current.clear();
    masterPlugNR.current.clear();
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  // ── build & start graph ──
  const buildAndStart = useCallback((offset: number) => {
    teardown();
    const ctx = getCtx();
    const allTracks = tracksRef.current;
    if (!allTracks.length) return;
    if (ctx.state === "suspended") ctx.resume();

    const masterGain = ctx.createGain();
    masterGain.gain.value = masterVolRef.current;
    masterGainRef.current = masterGain;

    let lastMasterNode: AudioNode = masterGain;

    // Master plugins
    masterPlugNR.current.clear();
    for (const mp of masterPlugins) {
      if (!mp.enabled) continue;
      const n = createPluginNode(ctx, mp);
      lastMasterNode.connect(n.input);
      lastMasterNode = n.output;
      masterPlugNR.current.set(mp.id, n);
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    masterAnalRef.current = analyser;
    lastMasterNode.connect(analyser);
    analyser.connect(ctx.destination);

    const hasSolo = allTracks.some(t => t.solo);
    const startAt = ctx.currentTime + 0.02;

    activeTracksRef.current.clear();
    for (const track of allTracks) {
      if (!track.buffer) continue;
      const buf = track.editedBuffer ?? track.buffer;
      const audible = hasSolo ? track.solo : !track.muted;

      // Skip tracks whose content has already ended at this seek offset
      if (offset >= buf.duration) continue;

      const source = ctx.createBufferSource();
      source.buffer = buf;

      // Build plugin chain
      let prev: AudioNode = source;
      const plugMap = new Map<string, PluginNodeResult>();
      for (const plugin of track.plugins) {
        if (!plugin.enabled) continue;
        const n = createPluginNode(ctx, plugin);
        prev.connect(n.input);
        prev = n.output;
        plugMap.set(plugin.id, n);
      }

      const gainNode = ctx.createGain();
      gainNode.gain.value = audible ? track.volume : 0;
      prev.connect(gainNode);

      const panNode = ctx.createStereoPanner();
      panNode.pan.value = track.pan;
      gainNode.connect(panNode);
      panNode.connect(masterGain);

      source.start(startAt, offset);
      activeTracksRef.current.set(track.id, { source, gain: gainNode, pan: panNode, plugins: plugMap });
    }

    offsetRef.current = offset;
    playStartRef.current = ctx.currentTime + 0.02;
    isPlayingRef.current = true;
    setIsPlaying(true);

    const tick = () => {
      if (!isPlayingRef.current) return;
      const elapsed = ctx.currentTime - playStartRef.current;
      const pos = offsetRef.current + elapsed;
      const dur = tracksRef.current.reduce((m, t) => Math.max(m, t.duration), 0);
      if (dur > 0 && pos >= dur) {
        if (loopRef.current) {
          buildAndStart(0);
        } else {
          teardown();
          setPosition(0);
          offsetRef.current = 0;
        }
        return;
      }
      setPosition(Math.max(0, pos));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [masterPlugins, teardown]);

  // ── transport ──
  const play  = useCallback(() => buildAndStart(offsetRef.current), [buildAndStart]);
  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !isPlayingRef.current) return;
    const elapsed = ctx.currentTime - playStartRef.current;
    offsetRef.current = offsetRef.current + elapsed;
    teardown();
  }, [teardown]);
  const stop = useCallback(() => {
    teardown();
    offsetRef.current = 0;
    setPosition(0);
  }, [teardown]);
  const seek = useCallback((secs: number) => {
    offsetRef.current = secs;
    setPosition(secs);
    if (isPlayingRef.current) buildAndStart(secs);
  }, [buildAndStart]);

  // ── master volume (live) ──
  const setMasterVolume = useCallback((v: number) => {
    setMasterVolumeState(v);
    masterVolRef.current = v;
    if (masterGainRef.current) masterGainRef.current.gain.setTargetAtTime(v, getCtx().currentTime, 0.01);
  }, []);

  // ── load track ──
  const addTrack = useCallback(async (file: File) => {
    try {
      const ctx = getCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const ab = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(ab);
      const peaks = getWaveformPoints(new Float32Array(buffer.getChannelData(0)), 200);
      const color = TRACK_COLORS[tracksRef.current.length % TRACK_COLORS.length];
      const id = crypto.randomUUID();
      const track: TrackState = {
        id, name: file.name.replace(/\.[^/.]+$/, ""),
        file, buffer, editedBuffer: null,
        peaks, duration: buffer.duration,
        muted: false, solo: false,
        volume: 0.85, pan: 0,
        plugins: [], region: null,
        color, edited: false,
      };
      setTracks(prev => [...prev.slice(0, 7), track]);
    } catch (e: any) {
      toast({ title: "Could not decode audio", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const removeTrack = useCallback((id: string) => {
    if (isPlayingRef.current) stop();
    setTracks(prev => prev.filter(t => t.id !== id));
  }, [stop]);

  // ── track strip controls (live) ──
  const setTrackVolume = useCallback((id: string, v: number) => {
    setTracks(p => p.map(t => t.id === id ? { ...t, volume: v } : t));
    const at = activeTracksRef.current.get(id);
    if (at) {
      const ctx = ctxRef.current!;
      at.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.008);
    }
  }, []);

  const setTrackPan = useCallback((id: string, pan: number) => {
    setTracks(p => p.map(t => t.id === id ? { ...t, pan } : t));
    const at = activeTracksRef.current.get(id);
    if (at) {
      const ctx = ctxRef.current!;
      at.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.008);
    }
  }, []);

  const toggleMute = useCallback((id: string) => {
    setTracks(prev => {
      const hasSolo = prev.some(t => t.solo);
      return prev.map(t => {
        if (t.id !== id) return t;
        const muted = !t.muted;
        const at = activeTracksRef.current.get(id);
        if (at) {
          const audible = hasSolo ? t.solo : !muted;
          at.gain.gain.setTargetAtTime(audible ? t.volume : 0, ctxRef.current!.currentTime, 0.008);
        }
        return { ...t, muted };
      });
    });
  }, []);

  const toggleSolo = useCallback((id: string) => {
    setTracks(prev => {
      const wasAnySolo = prev.some(t => t.solo);
      const updated = prev.map(t => t.id === id ? { ...t, solo: !t.solo } : t);
      const nowAnySolo = updated.some(t => t.solo);
      if (isPlayingRef.current) {
        updated.forEach(t => {
          const at = activeTracksRef.current.get(t.id);
          if (!at) return;
          const audible = nowAnySolo ? t.solo : !t.muted;
          at.gain.gain.setTargetAtTime(audible ? t.volume : 0, ctxRef.current!.currentTime, 0.008);
        });
      }
      return updated;
    });
  }, []);

  // ── plugins ──
  const addPlugin = useCallback((trackId: string, type: PluginType) => {
    const id = crypto.randomUUID();
    const def: PluginDef = { id, type, enabled: true, params: { ...PLUGIN_DEFAULTS[type] } };
    setTracks(p => p.map(t => t.id === trackId ? { ...t, plugins: [...t.plugins, def] } : t));
    if (isPlayingRef.current) {
      const offset = offsetRef.current + (ctxRef.current!.currentTime - playStartRef.current);
      setTimeout(() => buildAndStart(offset), 50);
    }
  }, [buildAndStart]);

  const removePlugin = useCallback((trackId: string, pluginId: string) => {
    setTracks(p => p.map(t => t.id === trackId ? { ...t, plugins: t.plugins.filter(pl => pl.id !== pluginId) } : t));
    if (isPlayingRef.current) {
      const offset = offsetRef.current + (ctxRef.current!.currentTime - playStartRef.current);
      setTimeout(() => buildAndStart(offset), 50);
    }
  }, [buildAndStart]);

  const togglePlugin = useCallback((trackId: string, pluginId: string) => {
    setTracks(p => p.map(t => t.id === trackId ? {
      ...t, plugins: t.plugins.map(pl => pl.id === pluginId ? { ...pl, enabled: !pl.enabled } : pl)
    } : t));
    if (isPlayingRef.current) {
      const offset = offsetRef.current + (ctxRef.current!.currentTime - playStartRef.current);
      setTimeout(() => buildAndStart(offset), 50);
    }
  }, [buildAndStart]);

  const reorderPlugin = useCallback((trackId: string, from: number, to: number) => {
    setTracks(p => p.map(t => {
      if (t.id !== trackId) return t;
      const plugins = [...t.plugins];
      const [item] = plugins.splice(from, 1);
      plugins.splice(to, 0, item);
      return { ...t, plugins };
    }));
    if (isPlayingRef.current) {
      const offset = offsetRef.current + (ctxRef.current!.currentTime - playStartRef.current);
      setTimeout(() => buildAndStart(offset), 50);
    }
  }, [buildAndStart]);

  const updatePlugin = useCallback((trackId: string, pluginId: string, paramKey: string, value: number) => {
    setTracks(p => p.map(t => t.id !== trackId ? t : {
      ...t,
      plugins: t.plugins.map(pl => pl.id !== pluginId ? pl : {
        ...pl, params: { ...pl.params, [paramKey]: value }
      })
    }));
    // Live update: AudioParam first, then specialParams fallback
    const at = activeTracksRef.current.get(trackId);
    if (at) {
      const plugNode = at.plugins.get(pluginId);
      if (plugNode) {
        const audioParam = plugNode.audioParams.get(paramKey);
        if (audioParam) {
          audioParam.setTargetAtTime(toAudioParamValue(paramKey, value), ctxRef.current!.currentTime, 0.01);
        } else {
          plugNode.specialParams.get(paramKey)?.(value);
        }
      }
    }
  }, []);

  const updateMasterPlugin = useCallback((pluginId: string, paramKey: string, value: number) => {
    setMasterPlugins(p => p.map(pl => pl.id !== pluginId ? pl : {
      ...pl, params: { ...pl.params, [paramKey]: value }
    }));
    const plugNode = masterPlugNR.current.get(pluginId);
    if (plugNode) {
      const audioParam = plugNode.audioParams.get(paramKey);
      if (audioParam) {
        audioParam.setTargetAtTime(toAudioParamValue(paramKey, value), ctxRef.current!.currentTime, 0.01);
      } else {
        plugNode.specialParams.get(paramKey)?.(value);
      }
    }
  }, []);

  // ── region editing ──
  const setRegion = useCallback((trackId: string, region: Region | null) => {
    setTracks(p => p.map(t => t.id === trackId ? { ...t, region } : t));
  }, []);

  const applyTrim = useCallback((trackId: string) => {
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track?.buffer || !track.region) return;
    const src = track.editedBuffer ?? track.buffer;
    const ctx = getCtx();
    const { start, end } = track.region;
    const sr = src.sampleRate;
    const startSample = Math.floor(start * sr);
    const endSample = Math.min(Math.floor(end * sr), src.length);
    const len = endSample - startSample;
    if (len <= 0) return;
    const newBuf = ctx.createBuffer(src.numberOfChannels, len, sr);
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      newBuf.copyToChannel(src.getChannelData(ch).slice(startSample, endSample), ch);
    }
    const peaks = getWaveformPoints(new Float32Array(newBuf.getChannelData(0)), 200);
    setTracks(p => p.map(t => t.id === trackId ? { ...t, editedBuffer: newBuf, peaks, duration: newBuf.duration, region: null, edited: true } : t));
    if (isPlayingRef.current) stop();
  }, [stop]);

  const applyDelete = useCallback((trackId: string) => {
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track?.buffer || !track.region) return;
    const src = track.editedBuffer ?? track.buffer;
    const ctx = getCtx();
    const { start, end } = track.region;
    const sr = src.sampleRate;
    const delStart = Math.floor(start * sr);
    const delEnd = Math.min(Math.floor(end * sr), src.length);
    const len = src.length - (delEnd - delStart);
    if (len <= 0) return;
    const newBuf = ctx.createBuffer(src.numberOfChannels, len, sr);
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const srcData = src.getChannelData(ch);
      const dst = newBuf.getChannelData(ch);
      dst.set(srcData.slice(0, delStart), 0);
      dst.set(srcData.slice(delEnd), delStart);
    }
    const peaks = getWaveformPoints(new Float32Array(newBuf.getChannelData(0)), 200);
    setTracks(p => p.map(t => t.id === trackId ? { ...t, editedBuffer: newBuf, peaks, duration: newBuf.duration, region: null, edited: true } : t));
    if (isPlayingRef.current) stop();
  }, [stop]);

  const resetEdit = useCallback((trackId: string) => {
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track?.buffer) return;
    const peaks = getWaveformPoints(new Float32Array(track.buffer.getChannelData(0)), 200);
    setTracks(p => p.map(t => t.id === trackId ? { ...t, editedBuffer: null, peaks, duration: track.buffer!.duration, region: null, edited: false } : t));
    if (isPlayingRef.current) stop();
  }, [stop]);

  // ── export ──
  const exportMix = useCallback(async () => {
    const all = tracksRef.current;
    if (!all.length) return;
    const maxDur = all.reduce((m, t) => Math.max(m, t.duration), 0);
    if (maxDur <= 0) return;
    const ctx = getCtx();
    const sr = ctx.sampleRate;

    toast({ title: "Exporting…", description: "Rendering mix offline — this may take a moment." });

    // Step 1: render full mix (all plugin chains + master bus) via OfflineAudioContext
    const offCtx = new OfflineAudioContext(2, Math.ceil(sr * maxDur), sr);
    const offMG = offCtx.createGain(); offMG.gain.value = masterVolRef.current;
    let offLast: AudioNode = offMG;
    for (const mp of masterPlugins) {
      if (!mp.enabled) continue;
      const n = createPluginNode(offCtx as unknown as AudioContext, mp);
      offLast.connect(n.input); offLast = n.output;
    }
    offLast.connect(offCtx.destination);
    const hasSolo = all.some(t => t.solo);
    for (const track of all) {
      if (!track.buffer) continue;
      const audible = hasSolo ? track.solo : !track.muted;
      if (!audible) continue;
      const buf = track.editedBuffer ?? track.buffer;
      const src = offCtx.createBufferSource(); src.buffer = buf;
      let prev: AudioNode = src;
      for (const plugin of track.plugins) {
        if (!plugin.enabled) continue;
        const n = createPluginNode(offCtx as unknown as AudioContext, plugin);
        prev.connect(n.input); prev = n.output;
      }
      const g = offCtx.createGain(); g.gain.value = track.volume;
      const pn = offCtx.createStereoPanner(); pn.pan.value = track.pan;
      prev.connect(g); g.connect(pn); pn.connect(offMG);
      src.start(0);
    }
    const rendered = await offCtx.startRendering();
    const wavBlob = audioBufferToWav(rendered);

    // Step 2: POST rendered WAV to server merge endpoint for final processing
    const form = new FormData();
    form.append("tracks", wavBlob, "rendered_mix.wav");
    form.append("arrangement", "layer");
    form.append("speed", "1");
    form.append("semitones", "0");
    form.append("noiseReduce", "off");
    form.append("voicePreset", "normal");

    const res = await fetch("/api/kernel/studio-mix", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Server export failed" }));
      toast({ title: "Export failed", description: String(err.error ?? "Server error"), variant: "destructive" });
      return;
    }
    const finalBlob = await res.blob();
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement("a"); a.href = url; a.download = "gravelking_mix.wav"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export complete", description: "Mix downloaded as WAV." });
  }, [masterPlugins, toast]);

  // ── cleanup on unmount ──
  useEffect(() => () => teardown(), [teardown]);

  return {
    tracks, isPlaying, position, masterVolume, loop, bpm,
    masterPlugins, maxDuration, masterAnalRef,
    addTrack, removeTrack,
    play, pause, stop, seek,
    setMasterVolume, setLoop,
    setTrackVolume, setTrackPan, toggleMute, toggleSolo,
    addPlugin, removePlugin, togglePlugin, reorderPlugin, updatePlugin,
    updateMasterPlugin, setMasterPlugins,
    setRegion, applyTrim, applyDelete, resetEdit,
    exportMix,
  };
}
