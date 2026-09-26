import { useState, useEffect, useRef, ChangeEvent, DragEvent } from 'react';
import { 
  Music, Play, Pause, Square, Volume2, VolumeX, 
  Download, Sparkles, Check, AlertTriangle, Cpu, Terminal, Sliders, Smartphone,
  Upload, Activity, Gauge, Disc, RefreshCcw, Mic, HelpCircle, Layers, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

interface Track {
  id: number;
  name: string;
  type: string;
  color: string;
}

const TRACKS_CONFIG: Track[] = [
  { id: 1, name: "Sub Kick Drum", type: "Analog Oscillator Synth", color: "#00ffcc" },
  { id: 2, name: "Snappy Perc Hats", type: "Filtered Highpass Noise", color: "#ff3366" },
  { id: 3, name: "Melodic Lead Synth", type: "Poly Web Synth Node", color: "#ffcc00" },
  { id: 4, name: "Vocal Vocoder Stem", type: "Stereo Buffer Source", color: "#a855f7" }
];

const NOTE_FREQUENCIES: { key: string; note: string; freq: number }[] = [
  { key: 'a', note: 'C4', freq: 261.63 },
  { key: 's', note: 'D4', freq: 293.66 },
  { key: 'd', note: 'E4', freq: 329.63 },
  { key: 'f', note: 'F4', freq: 349.23 },
  { key: 'g', note: 'G4', freq: 392.00 },
  { key: 'h', note: 'A4', freq: 440.00 },
  { key: 'j', note: 'B4', freq: 493.88 },
  { key: 'k', note: 'C5', freq: 523.25 },
];

interface SovereignDAWProps {
  onDownloadSystemGuide?: () => void;
}

export default function SovereignDAW({ onDownloadSystemGuide }: SovereignDAWProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(124);
  const [synthWave, setSynthWave] = useState<'sine' | 'square' | 'sawtooth' | 'triangle'>('triangle');
  const [activeKeys, setActiveKeys] = useState<{ [key: string]: boolean }>({});
  
  // Dynamic parameters for four channels
  const [volumes, setVolumes] = useState<number[]>([80, 70, 85, 90]);
  const [panning, setPanning] = useState<number[]>([0.0, -0.4, 0.4, 0.0]); // -1.0 (Full L) to +1.0 (Full R)
  const [mutes, setMutes] = useState<boolean[]>([false, false, false, false]);
  const [solos, setSolos] = useState<boolean[]>([false, false, false, false]);
  
  // Track-specific Parametric Equalizers (-12dB to +12dB)
  const [eqBass, setEqBass] = useState<number[]>([0, 0, 0, 0]);
  const [eqMid, setEqMid] = useState<number[]>([0, 0, 0, 0]);
  const [eqTreble, setEqTreble] = useState<number[]>([0, 0, 0, 0]);

  // Sequencer Grid state (4 tracks x 16 steps)
  const [sequencerGrid, setSequencerGrid] = useState<boolean[][]>([
    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], // Kick
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false], // Hats
    [true, false, false, true, false, true, false, false, true, false, false, true, false, true, false, false],  // Synth Lead
    [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, false]   // Perc / Audio trigger
  ]);

  const [currentStep, setCurrentStep] = useState<number>(-1);

  // Audio Host Plugins Settings
  const [distortionEnabled, setDistortionEnabled] = useState(false);
  const [distortionDrive, setDistortionDrive] = useState(20);
  
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayTime, setDelayTime] = useState(0.33); // seconds
  const [delayFeedback, setDelayFeedback] = useState(0.4); // feedback gain 

  const [clubFilterEnabled, setClubFilterEnabled] = useState(false);
  const [clubFilterCutoff, setClubFilterCutoff] = useState(3500); // Hz
  const [clubFilterReso, setClubFilterReso] = useState(1.5); // Q-Factor

  // Master Studio physical Reverb simulation & master Compression
  const [reverbEnabled, setReverbEnabled] = useState(true);
  const [reverbWetness, setReverbWetness] = useState(25); // wet mix %
  const [reverbSize, setReverbSize] = useState(1.0); // reverb decay in seconds

  const [compressorEnabled, setCompressorEnabled] = useState(true);
  const [compressorThreshold, setCompressorThreshold] = useState(-16); // dB
  const [compressorRatio, setCompressorRatio] = useState(4.0); // ratio

  const [timeReadable, setTimeReadable] = useState("0:00.00");
  const [currentPlayheadPercent, setCurrentPlayheadPercent] = useState(0);

  // Stems status
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [loadingAudioFile, setLoadingAudioFile] = useState(false);
  const [uploadedBuffer, setUploadedBuffer] = useState<AudioBuffer | null>(null);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);
  const [isRenderingMix, setIsRenderingMix] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Microphone recording state
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Sound loop preset pack catalog
  const STUDIO_PRESETS = [
    {
      name: "Cyber Trap Neon",
      bpm: 140,
      wave: 'triangle' as const,
      color: "from-cyan-500 to-blue-600",
      description: "Aggressive trap kicks, fast metallic hats, and resonant triangle synths.",
      panning: [0.0, -0.3, 0.3, 0.0],
      grid: [
        [true, false, false, false, false, false, true, false, true, false, false, false, false, true, false, false],
        [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, true],
        [true, false, false, true, false, true, false, false, true, false, false, true, false, true, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false]
      ]
    },
    {
      name: "Retro Vaporwave 80s",
      bpm: 112,
      wave: 'sawtooth' as const,
      color: "from-fuchsia-500 to-pink-500",
      description: "Dreamy analog four-on-the-floor beat, spatial lead hook and lush physical reverb.",
      panning: [0.0, -0.5, 0.5, 0.0],
      grid: [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        [false, false, false, true, false, false, false, true, false, false, false, true, false, false, false, true]
      ]
    },
    {
      name: "Ambient Dream Chill",
      bpm: 86,
      wave: 'sine' as const,
      color: "from-amber-400 to-yellow-600",
      description: "Warm acoustic kicks, slow rhythmic space hats and deep warm polyphonic synthesizer layers.",
      panning: [0.0, -0.2, 0.2, 0.0],
      grid: [
        [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [true, true, false, false, true, true, false, false, true, true, false, false, true, true, false, false],
        [false, false, false, false, false, false, false, true, false, false, false, false, false, false, true, false]
      ]
    },
    {
      name: "Mainstage House Kick",
      bpm: 126,
      wave: 'square' as const,
      color: "from-violet-600 to-purple-600",
      description: "Fast high-tempo house drive with sharp wave leads and maximum compressor punch.",
      panning: [0.0, -0.4, 0.4, 0.1],
      grid: [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        [false, true, true, false, false, true, true, false, false, true, true, false, false, true, true, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false]
      ]
    }
  ];

  // System trace logging
  const [logs, setLogs] = useState<string[]>([
    "BANDLAB_ENGINE: Professional Web Audio driver optimized for ultra-low latency.",
    "CONSOLE_DESK: Built 4-channel gain strips with dedicated stereo panning.",
    "FX_REVERB: Programmed mathematical ambient space convolvulator.",
    "MASTER_LIMITER: Dynamics compressor node active."
  ]);

  // Hardware Connection references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);
  
  // Per-channel DSP node arrays
  const trackGainsRef = useRef<(GainNode | null)[]>([null, null, null, null]);
  const trackPannersRef = useRef<(StereoPannerNode | null)[]>([null, null, null, null]);
  const eqBassFiltersRef = useRef<(BiquadFilterNode | null)[]>([null, null, null, null]);
  const eqMidFiltersRef = useRef<(BiquadFilterNode | null)[]>([null, null, null, null]);
  const eqHighFiltersRef = useRef<(BiquadFilterNode | null)[]>([null, null, null, null]);

  // Dynamic DSP Effect nodes refs
  const distortionNodeRef = useRef<WaveShaperNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
  const clubFilterNodeRef = useRef<BiquadFilterNode | null>(null);

  // Master spatial reverb & compression nodes
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const reverbDryGainRef = useRef<GainNode | null>(null);
  const reverbWetGainRef = useRef<GainNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);

  // Micro recording utilities
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordIntervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // Playback timers
  const isPlayingRef = useRef(false);
  const bpmRef = useRef(124);
  const timerIDRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const uploadedBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Real-time canvas representation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Register state trackers
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      initAudio();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      addLog("AUDIO_ENGINE: Master Playback sequence initiated.");
      if (uploadedBuffer) {
        startStemLoopPlayback(0);
      }
    } else {
      addLog("AUDIO_ENGINE: Playback halted. Repositioning transport playhead.");
      stopStemLoopPlayback();
      if (timerIDRef.current) {
        clearTimeout(timerIDRef.current);
        timerIDRef.current = null;
      }
      setCurrentPlayheadPercent(0);
      setCurrentStep(-1);
      setTimeReadable("0:00.00");
    }
  }, [isPlaying]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  // Logging sequence helper
  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 10));
  };

  // Helper to construct artificial spatial reverb impulses programmatically
  const createReverbImpulseResponse = (ctx: AudioContext, duration: number, decay: number) => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
       const percent = i / length;
       // exponential decay noise
       left[i] = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
       right[i] = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    }
    return impulse;
  };

  // Build the complete Web Audio DSP Routing Graph
  const initAudio = () => {
    if (audioCtxRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ latencyHint: 'interactive' });
      audioCtxRef.current = ctx;

      // Master main output volume level
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.85, ctx.currentTime);
      mainGainRef.current = mainGain;

      // Dynamics Compressor mastering node
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(compressorThreshold, ctx.currentTime);
      compressor.ratio.setValueAtTime(compressorRatio, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressorNodeRef.current = compressor;

      // Convolution physical Reverb processor
      const reverbNode = ctx.createConvolver();
      reverbNode.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.5);
      reverbNodeRef.current = reverbNode;

      const reverbWetGain = ctx.createGain();
      reverbWetGain.gain.setValueAtTime(reverbWetness / 100, ctx.currentTime);
      reverbWetGainRef.current = reverbWetGain;

      const reverbDryGain = ctx.createGain();
      reverbDryGain.gain.setValueAtTime(1 - (reverbWetness / 100), ctx.currentTime);
      reverbDryGainRef.current = reverbDryGain;

      // Delay Plugin Nodes
      const delayNode = ctx.createDelay(2.0);
      delayNode.delayTime.setValueAtTime(delayTime, ctx.currentTime);
      delayNodeRef.current = delayNode;

      const delayFeedback = ctx.createGain();
      delayFeedback.gain.setValueAtTime(delayFeedback, ctx.currentTime);
      delayFeedbackRef.current = delayFeedback;

      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);

      // Lowpass sweeps Filter
      const clubFilterNode = ctx.createBiquadFilter();
      clubFilterNode.type = 'lowpass';
      clubFilterNode.frequency.setValueAtTime(clubFilterCutoff, ctx.currentTime);
      clubFilterNode.Q.setValueAtTime(clubFilterReso, ctx.currentTime);
      clubFilterNodeRef.current = clubFilterNode;

      // Overdrive distortion shaper
      const distortionNode = ctx.createWaveShaper();
      distortionNode.curve = makeDistortionCurve(distortionDrive);
      distortionNode.oversample = '4x';
      distortionNodeRef.current = distortionNode;

      // Dry / wet matrix setup for master output
      rebuildEffectsCabinet();

      // Create individual Channel Equalizers and Gain Nodes
      for (let i = 0; i < 4; i++) {
        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.setValueAtTime(150, ctx.currentTime);
        bassFilter.gain.setValueAtTime(eqBass[i], ctx.currentTime);
        eqBassFiltersRef.current[i] = bassFilter;

        const midFilter = ctx.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.setValueAtTime(1000, ctx.currentTime);
        midFilter.Q.setValueAtTime(1.0, ctx.currentTime);
        midFilter.gain.setValueAtTime(eqMid[i], ctx.currentTime);
        eqMidFiltersRef.current[i] = midFilter;

        const highFilter = ctx.createBiquadFilter();
        highFilter.type = 'highshelf';
        highFilter.frequency.setValueAtTime(6000, ctx.currentTime);
        highFilter.gain.setValueAtTime(eqTreble[i], ctx.currentTime);
        eqHighFiltersRef.current[i] = highFilter;

        // Stereo Panning Nodes
        let pannerNode: StereoPannerNode | null = null;
        if (ctx.createStereoPanner) {
          pannerNode = ctx.createStereoPanner();
          pannerNode.pan.setValueAtTime(panning[i], ctx.currentTime);
        }
        trackPannersRef.current[i] = pannerNode;

        const trkGain = ctx.createGain();
        trkGain.gain.setValueAtTime(volumes[i] / 100, ctx.currentTime);
        trackGainsRef.current[i] = trkGain;

        // Routing Chain: Instrument Source -> Bass Filter -> Mid Filter -> High Filter -> Stereo Panner -> Channel Gain Volume -> Distortion Plugin Node
        bassFilter.connect(midFilter);
        midFilter.connect(highFilter);

        if (pannerNode) {
          highFilter.connect(pannerNode);
          pannerNode.connect(trkGain);
        } else {
          highFilter.connect(trkGain);
        }
        
        trkGain.connect(distortionNode);
      }

      addLog("AUDIO_ENGINE: Built 4-channel parametric equalizers and active high-fidelity effects bus.");
    } catch (e) {
      console.error(e);
      addLog("ERROR: Highly-stable Web Audio DSP graph crashed on bootstrap.");
    }
  };

  // Rebuild/bypass routing for plugins
  const rebuildEffectsCabinet = () => {
    if (!audioCtxRef.current || !distortionNodeRef.current || !clubFilterNodeRef.current || !delayNodeRef.current || !delayFeedbackRef.current || !mainGainRef.current) return;
    const ctx = audioCtxRef.current;
    
    try {
      distortionNodeRef.current.disconnect();
      clubFilterNodeRef.current.disconnect();
      delayNodeRef.current.disconnect();
      delayFeedbackRef.current.disconnect();
    } catch(e) {}

    let currentInput: AudioNode = distortionNodeRef.current;
    distortionNodeRef.current.curve = distortionEnabled ? makeDistortionCurve(distortionDrive * 1.5) : null;
    
    if (clubFilterEnabled) {
      currentInput.connect(clubFilterNodeRef.current);
      currentInput = clubFilterNodeRef.current;
    }

    if (delayEnabled) {
      currentInput.connect(delayNodeRef.current);
      delayNodeRef.current.connect(mainGainRef.current);
    }
    
    currentInput.connect(mainGainRef.current);

    // Dynamic Master mastering effects: Compressor and Spatial Reverbs
    mainGainRef.current.disconnect();
    let finalMixBus: AudioNode = mainGainRef.current;

    if (compressorEnabled && compressorNodeRef.current) {
      finalMixBus.connect(compressorNodeRef.current);
      finalMixBus = compressorNodeRef.current;
    }

    if (reverbEnabled && reverbNodeRef.current && reverbWetGainRef.current && reverbDryGainRef.current) {
      // route split reverb signals
      finalMixBus.connect(reverbNodeRef.current);
      reverbNodeRef.current.connect(reverbWetGainRef.current);
      reverbWetGainRef.current.connect(ctx.destination);

      finalMixBus.connect(reverbDryGainRef.current);
      reverbDryGainRef.current.connect(ctx.destination);
    } else {
      finalMixBus.connect(ctx.destination);
    }
  };

  // Synchronize effect and plugin properties dynamically
  useEffect(() => {
    rebuildEffectsCabinet();
  }, [distortionEnabled, distortionDrive, delayEnabled, clubFilterEnabled, reverbEnabled, compressorEnabled]);

  useEffect(() => {
    if (!audioCtxRef.current || !compressorNodeRef.current) return;
    const ctx = audioCtxRef.current;
    compressorNodeRef.current.threshold.setValueAtTime(compressorThreshold, ctx.currentTime);
    compressorNodeRef.current.ratio.setValueAtTime(compressorRatio, ctx.currentTime);
  }, [compressorThreshold, compressorRatio]);

  useEffect(() => {
    if (!audioCtxRef.current || !reverbWetGainRef.current || !reverbDryGainRef.current || !reverbNodeRef.current) return;
    const ctx = audioCtxRef.current;
    reverbWetGainRef.current.gain.setValueAtTime(reverbWetness / 100, ctx.currentTime);
    reverbDryGainRef.current.gain.setValueAtTime(1 - (reverbWetness / 100), ctx.currentTime);
  }, [reverbWetness]);

  useEffect(() => {
    if (!audioCtxRef.current || !reverbNodeRef.current) return;
    const ctx = audioCtxRef.current;
    try {
      reverbNodeRef.current.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.5);
    } catch(e) {}
  }, [reverbSize]);

  useEffect(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    for (let i = 0; i < 4; i++) {
      const bassNode = eqBassFiltersRef.current[i];
      if (bassNode) bassNode.gain.setValueAtTime(eqBass[i], ctx.currentTime);
      const midNode = eqMidFiltersRef.current[i];
      if (midNode) midNode.gain.setValueAtTime(eqMid[i], ctx.currentTime);
      const highNode = eqHighFiltersRef.current[i];
      if (highNode) highNode.gain.setValueAtTime(eqTreble[i], ctx.currentTime);
    }
  }, [eqBass, eqMid, eqTreble]);

  useEffect(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    for (let i = 0; i < 4; i++) {
      const panner = trackPannersRef.current[i];
      if (panner) {
        panner.pan.setValueAtTime(panning[i], ctx.currentTime);
      }
    }
  }, [panning]);

  useEffect(() => {
    if (!audioCtxRef.current || !delayNodeRef.current || !delayFeedbackRef.current) return;
    const ctx = audioCtxRef.current;
    delayNodeRef.current.delayTime.setValueAtTime(delayTime, ctx.currentTime);
    delayFeedbackRef.current.gain.setValueAtTime(delayFeedback, ctx.currentTime);
  }, [delayTime, delayFeedback]);

  useEffect(() => {
    if (!audioCtxRef.current || !clubFilterNodeRef.current) return;
    const ctx = audioCtxRef.current;
    clubFilterNodeRef.current.frequency.setValueAtTime(clubFilterCutoff, ctx.currentTime);
    clubFilterNodeRef.current.Q.setValueAtTime(clubFilterReso, ctx.currentTime);
  }, [clubFilterCutoff, clubFilterReso]);

  // Handle mutes, solos and channel gains instantly
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const anySoloActive = solos.some(s => s);

    for (let i = 0; i < 4; i++) {
      const gainNode = trackGainsRef.current[i];
      if (!gainNode) continue;

      let targetGain = volumes[i] / 100;
      if (mutes[i]) {
        targetGain = 0;
      } else if (anySoloActive && !solos[i]) {
        targetGain = 0;
      }

      gainNode.gain.setValueAtTime(targetGain, ctx.currentTime);
    }
  }, [volumes, mutes, solos]);

  const makeDistortionCurve = (amount: number) => {
    const k = typeof amount === 'number' ? amount : 25;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

  // Synthesized instrument engines
  const playSynthesizedKick = (time: number) => {
    if (!audioCtxRef.current || !eqBassFiltersRef.current[0]) return;
    const ctx = audioCtxRef.current;
    
    const osc = ctx.createOscillator();
    const voiceGain = ctx.createGain();

    osc.connect(voiceGain);
    voiceGain.connect(eqBassFiltersRef.current[0]); 

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.16);

    voiceGain.gain.setValueAtTime(0.7, time);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.start(time);
    osc.stop(time + 0.2);
  };

  const playSynthesizedHiHat = (time: number) => {
    if (!audioCtxRef.current || !eqBassFiltersRef.current[1]) return;
    const ctx = audioCtxRef.current;

    const bufferSize = ctx.sampleRate * 0.04;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.22, time);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(eqBassFiltersRef.current[1]); 

    noise.start(time);
    noise.stop(time + 0.04);
  };

  const playSynthesizedLeadNote = (freq: number, time: number) => {
    if (!audioCtxRef.current || !eqBassFiltersRef.current[2]) return;
    const ctx = audioCtxRef.current;

    const osc = ctx.createOscillator();
    const voiceGain = ctx.createGain();

    osc.type = synthWave;
    osc.frequency.setValueAtTime(freq, time);

    voiceGain.gain.setValueAtTime(0, time);
    voiceGain.gain.linearRampToValueAtTime(0.3, time + 0.02);
    voiceGain.gain.exponentialRampToValueAtTime(0.1, time + 0.18);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

    osc.connect(voiceGain);
    voiceGain.connect(eqBassFiltersRef.current[2]); 

    osc.start(time);
    osc.stop(time + 0.45);
  };

  const playSynthesizedPerc = (time: number) => {
    if (!audioCtxRef.current || !eqBassFiltersRef.current[3]) return;
    const ctx = audioCtxRef.current;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const voiceGain = ctx.createGain();

    osc1.frequency.setValueAtTime(820, time);
    osc2.frequency.setValueAtTime(1150, time);

    voiceGain.gain.setValueAtTime(0.24, time);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc1.connect(voiceGain);
    osc2.connect(voiceGain);
    voiceGain.connect(eqBassFiltersRef.current[3]);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.1);
    osc2.stop(time + 0.1);
  };

  const triggerLiveSynthNode = (freq: number) => {
    initAudio();
    if (!audioCtxRef.current || !eqBassFiltersRef.current[2]) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    playSynthesizedLeadNote(freq, ctx.currentTime);
    addLog(`MIDI_KEYS: Triggered node note freq ${freq}Hz (${synthWave.toUpperCase()}).`);
  };

  // Playback stem looping sequence
  const startStemLoopPlayback = (offsetSeconds: number) => {
    if (!audioCtxRef.current || !uploadedBuffer) return;
    const ctx = audioCtxRef.current;

    stopStemLoopPlayback();

    const source = ctx.createBufferSource();
    source.buffer = uploadedBuffer;
    source.loop = true;
    source.connect(eqBassFiltersRef.current[3] || ctx.destination);

    const startPoint = offsetSeconds % uploadedBuffer.duration;
    source.start(ctx.currentTime, startPoint);
    uploadedBufferSourceRef.current = source;
    addLog(`STEMS_LOADER: Custom loops synchronized from offset ${startPoint.toFixed(2)}s.`);
  };

  const stopStemLoopPlayback = () => {
    if (uploadedBufferSourceRef.current) {
      try {
        uploadedBufferSourceRef.current.stop();
      } catch (e) { }
      uploadedBufferSourceRef.current = null;
    }
  };

  // Load a sound pack loop model
  const loadPresetLoopPack = (packIdx: number) => {
    const pack = STUDIO_PRESETS[packIdx];
    setBpm(pack.bpm);
    setSynthWave(pack.wave);
    setSequencerGrid(pack.grid);
    setPanning(pack.panning);
    addLog(`PRESET_PACK: Injected loop pack template: ${pack.name} (${pack.bpm} BPM)`);
  };

  // High-Precision Beat Cycle Sequencer Scheduler
  useEffect(() => {
    let nextNoteTime = 0.0;
    const scheduleAheadTime = 0.15; 
    const lookahead = 30.0; 
    let current16thNote = 0;

    const scheduler = () => {
      if (!audioCtxRef.current || !isPlayingRef.current) return;
      while (nextNoteTime < audioCtxRef.current.currentTime + scheduleAheadTime) {
        scheduleInstruments(current16thNote, nextNoteTime);
        advanceBeatPointer();
      }
      timerIDRef.current = window.setTimeout(scheduler, lookahead);
    };

    const advanceBeatPointer = () => {
      if (!audioCtxRef.current) return;
      // sync React step view seamlessly
      const targetStep = current16thNote;
      setCurrentStep(targetStep);

      const secondsPerBeat = 60.0 / bpmRef.current;
      const sixteenthNoteDuration = secondsPerBeat / 4; 
      nextNoteTime += sixteenthNoteDuration;
      current16thNote = (current16thNote + 1) % 16;
    };

    const scheduleInstruments = (step: number, time: number) => {
      const anySoloActive = solos.some(s => s);

      // Channel 1: Kick
      if (sequencerGrid[0][step] && !mutes[0] && (!anySoloActive || solos[0])) {
        playSynthesizedKick(time);
      }
      // Channel 2: Snappy Hats
      if (sequencerGrid[1][step] && !mutes[1] && (!anySoloActive || solos[1])) {
        playSynthesizedHiHat(time);
      }
      // Channel 3: Melodic Lead Synth note scale
      if (sequencerGrid[2][step] && !mutes[2] && (!anySoloActive || solos[2])) {
        // Play melodic frequency based on step index matrix
        const scale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
        const pitchFreq = scale[step % scale.length];
        playSynthesizedLeadNote(pitchFreq, time);
      }
      // Channel 4: Sound effect loop / imported stem cue
      if (sequencerGrid[3][step] && !mutes[3] && (!anySoloActive || solos[3])) {
        playSynthesizedPerc(time);
      }
    };

    if (isPlaying) {
      initAudio();
      if (audioCtxRef.current) {
        nextNoteTime = audioCtxRef.current.currentTime + 0.05;
        startTimeRef.current = audioCtxRef.current.currentTime;
        scheduler();
      }
    } else {
      if (timerIDRef.current) {
        clearTimeout(timerIDRef.current);
        timerIDRef.current = null;
      }
    }

    return () => {
      if (timerIDRef.current) {
        clearTimeout(timerIDRef.current);
      }
    };
  }, [isPlaying, sequencerGrid, mutes, solos, synthWave]);

  // Multitrack waveform visuals canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = Math.max(canvas.clientWidth || 0, 300));
    let height = (canvas.height = Math.max(canvas.clientHeight || 0, 160));

    const handleResize = () => {
      width = canvas.width = Math.max(canvas.clientWidth || 0, 300);
      height = canvas.height = Math.max(canvas.clientHeight || 0, 160);
    };
    window.addEventListener('resize', handleResize);

    const drawGridFrame = () => {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        animationRef.current = requestAnimationFrame(drawGridFrame);
        return;
      }

      // Dark slate backdrop
      ctx.fillStyle = '#06070b';
      ctx.fillRect(0, 0, width, height);

      // Grid timelines
      ctx.strokeStyle = '#12141f';
      ctx.lineWidth = 1;

      const trackHeight = height / 4;

      // Draw vertical tempo bars
      for (let bar = 0; bar < 4; bar++) {
        const barX = (bar / 4) * width;
        ctx.strokeStyle = '#1c1f2e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(barX, 0);
        ctx.lineTo(barX, height);
        ctx.stroke();

        // Subbeats
        for (let beat = 1; beat < 4; beat++) {
          const beatX = barX + (beat / 16) * width;
          ctx.strokeStyle = '#0c0d15';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(beatX, 0);
          ctx.lineTo(beatX, height);
          ctx.stroke();
        }
      }

      // Draw flowing active waves
      TRACKS_CONFIG.forEach((track, j) => {
        const yOffset = j * trackHeight;

        // Visual track divider
        ctx.strokeStyle = '#0a0a10';
        ctx.beginPath();
        ctx.moveTo(0, yOffset + trackHeight);
        ctx.lineTo(width, yOffset + trackHeight);
        ctx.stroke();

        ctx.fillStyle = track.color;
        ctx.font = 'bold 8px monospace';
        ctx.fillText(`CH_0${j+1}: ${track.name.toUpperCase()}`, 12, yOffset + 14);

        if (j === 3 && !uploadedBuffer) {
          ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
          ctx.font = 'italic 7px monospace';
          ctx.fillText("[STEM EMPTY - DRAG STEM OR RECORD FROM MIC]", 12, yOffset + 24);
        }

        // Draw flowing audio curves
        const stepSize = 3;
        for (let x = 0; x < width; x += stepSize) {
          const s1 = Math.sin(x * 0.02 + j * 8) * Math.cos(x * 0.008);
          const s2 = Math.sin(x * 0.05 - j * 2) * 0.4;
          let amp = 0.45 * s1 + 0.15 * s2;

          const isTrackActive = isPlaying && !mutes[j] && (!solos.some(s => s) || solos[j]);
          // Scale waves dynamically when trigger sequencer beats occur
          const hasTriggerBeat = sequencerGrid[j][currentStep >= 0 ? currentStep : 0];
          const beatModifier = hasTriggerBeat && isTrackActive ? 1.5 : 1.0;
          const activeScalar = isTrackActive ? (0.6 + 0.3 * Math.sin(Date.now() * 0.01 + j)) * beatModifier : 0.25;
          const waveHeight = Math.abs(amp * trackHeight * 0.5 * activeScalar);

          ctx.fillStyle = track.color + (isTrackActive ? 'cc' : '20');
          ctx.fillRect(x, yOffset + trackHeight / 2 - waveHeight / 2, 1.5, waveHeight);
        }

        // Real panning indicators (Stereo Balance Representation)
        const panValue = Number.isFinite(panning[j]) ? panning[j] : 0;
        const centerPanLine = width - 180 + (panValue * 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(width - 210, yOffset + 12);
        ctx.lineTo(width - 150, yOffset + 12);
        ctx.stroke();

        if (Number.isFinite(centerPanLine)) {
          ctx.fillStyle = track.color;
          ctx.beginPath();
          ctx.arc(centerPanLine, yOffset + 12, 2.5, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '6px monospace';
        ctx.fillText(`PAN ${panValue > 0 ? 'R' : 'L'}${Math.abs(panValue).toFixed(1)}`, width - 210, yOffset + 8);

        // dB Volume Master Meter display
        const volumeFactor = ((volumes[j] || 0) / 100) * 60;
        ctx.fillStyle = '#05060a';
        ctx.fillRect(width - 80, yOffset + 10, 60, 4);
        ctx.fillStyle = mutes[j] ? '#ef4444' : track.color;
        ctx.fillRect(width - 80, yOffset + 10, mutes[j] ? 3 : volumeFactor, 4);
      });

      // Render playhead timeline swipe indicator
      if (isPlaying && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
        const currentBpm = Math.max(1, bpmRef.current || 124);
        const totalDuration = (60.0 / currentBpm) * 4;
        const percent = totalDuration > 0 ? (elapsed % totalDuration) / totalDuration : 0;
        const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(1, percent)) : 0;
        setCurrentPlayheadPercent(safePercent);

        const mini = Math.floor(Math.max(0, elapsed) / 60);
        const secs = Math.floor(Math.max(0, elapsed) % 60);
        const centis = Math.floor((Math.max(0, elapsed) % 1) * 100);
        setTimeReadable(`${mini}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`);

        const playheadX = safePercent * width;
        if (Number.isFinite(playheadX)) {
          ctx.fillStyle = '#ff3366';
          ctx.fillRect(playheadX - 1, 0, 2, height);

          // Sweep indicator head cap
          ctx.beginPath();
          ctx.moveTo(playheadX - 5, 0);
          ctx.lineTo(playheadX + 5, 0);
          ctx.lineTo(playheadX, 7);
          ctx.closePath();
          ctx.fillStyle = '#ff3366';
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, 1, height);
      }

      animationRef.current = requestAnimationFrame(drawGridFrame);
    };

    drawGridFrame();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, volumes, panning, bpm, mutes, solos, uploadedBuffer, currentStep, sequencerGrid]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const keyObj = NOTE_FREQUENCIES.find(n => n.key === e.key.toLowerCase());
      if (keyObj) {
        setActiveKeys(prev => ({ ...prev, [keyObj.key]: true }));
        triggerLiveSynthNode(keyObj.freq);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyObj = NOTE_FREQUENCIES.find(n => n.key === e.key.toLowerCase());
      if (keyObj) {
        setActiveKeys(prev => ({ ...prev, [keyObj.key]: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [synthWave]);

  // Mic capture functions
  const handleMicrophoneSession = async () => {
    if (isRecordingMic) {
      // STOP recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(tr => tr.stop());
      }
      if (recordIntervalIdRef.current) {
        clearInterval(recordIntervalIdRef.current);
      }
      setIsRecordingMic(false);
      addLog("REC_ENGINE: Microphone session captures completed, synthesizing sound...");
    } else {
      // START recording
      initAudio();
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;

      try {
        addLog("REC_ENGINE: Acquiring physical studio microphone access...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingStreamRef.current = stream;

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          setLoadingAudioFile(true);
          setUploadedFileName("GK_Voice_MicTrack.wav");
          const webmBlob = new Blob(chunks, { type: 'audio/webm; codecs=opus' });
          try {
            const arr = await webmBlob.arrayBuffer();
            ctx.decodeAudioData(arr, (decodedBuf) => {
              setUploadedBuffer(decodedBuf);
              setLoadingAudioFile(false);
              addLog(`REC_ENGINE: Live vocal buffer ready (${decodedBuf.duration.toFixed(2)}s, ${decodedBuf.numberOfChannels} ch). Inserting in stem mixer CH_04.`);
              if (isPlayingRef.current) {
                startStemLoopPlayback(0);
              }
            }, (err) => {
              setLoadingAudioFile(false);
              addLog("ERROR: Codec decoding failure. Check microphone permissions.");
            });
          } catch(e) {
            setLoadingAudioFile(false);
          }
        };

        mediaRecorder.start();
        setIsRecordingMic(true);
        setRecordingDuration(0);
        addLog("REC_ENGINE: RECORDING session active for Vocal Vocoder Stem Track 4. Talk or sing into your mic!");

        recordIntervalIdRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      } catch(err) {
        addLog("ERROR: Microphone permission access denied by host container.");
        console.error(err);
      }
    }
  };

  const importStemAudioFile = async (file: File) => {
    initAudio();
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    setLoadingAudioFile(true);
    setUploadedFileName(file.name);
    addLog(`STEMS_LOADER: Parsing uploaded stem '${file.name}' via Offline Audio Decoders...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      ctx.decodeAudioData(arrayBuffer, (soundBuffer) => {
        setUploadedBuffer(soundBuffer);
        setLoadingAudioFile(false);
        addLog(`STEMS_LOADER: Success! Decoded: ${soundBuffer.numberOfChannels} channels, duration: ${soundBuffer.duration.toFixed(2)}s.`);
        
        if (isPlayingRef.current) {
          const elapsed = ctx.currentTime - startTimeRef.current;
          const totalDuration = (60.0 / bpmRef.current) * 4;
          const offset = elapsed % totalDuration;
          startStemLoopPlayback(offset);
        }
      }, (err) => {
        setLoadingAudioFile(false);
        addLog(`ERROR: Audio stem decode fail. Check file format.`);
      });
    } catch(e) {
      setLoadingAudioFile(false);
      addLog(`ERROR: Buffer decode error.`);
    }
  };

  const handleStemFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importStemAudioFile(file);
  };

  const loadProceduralDemoVoiceStem = () => {
    initAudio();
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    setLoadingAudioFile(true);
    addLog("STEMS_LOADER: Generating professional ambient loop stem procedurally...");

    setTimeout(() => {
      const sampleRate = ctx.sampleRate;
      const duration = 8.0;
      const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
      
      const leftChan = buffer.getChannelData(0);
      const rightChan = buffer.getChannelData(1);

      for (let i = 0; i < leftChan.length; i++) {
        const time = i / sampleRate;
        // high-class spatial synth vocal sweep sound
        const f1 = Math.sin(2 * Math.PI * 130 * time) * 0.2;
        const f2 = Math.sin(2 * Math.PI * 260 * time + Math.sin(2 * Math.PI * 1.5 * time)) * 0.15;
        const formants = (f1 + f2) * Math.sin(2 * Math.PI * 0.25 * time); 
        
        leftChan[i] = formants * Math.cos(2 * Math.PI * 0.1 * time);
        rightChan[i] = formants * Math.sin(2 * Math.PI * 0.1 * time);
      }

      setUploadedBuffer(buffer);
      setUploadedFileName("GK_Procedural_Voicepad_Stem.wav");
      setLoadingAudioFile(false);
      addLog("STEMS_LOADER: Procedural loop loaded in Stem Channel 4. Sounding lofi!");

      if (isPlayingRef.current) {
        startStemLoopPlayback(0);
      }
    }, 1000);
  };

  // 100% Client-Side Audio WAV Compiler
  const renderMasterMixToWavFile = async () => {
    initAudio();
    if (isRenderingMix) return;
    setIsRenderingMix(true);
    addLog("EXPORTER: Initiating full master mix render to 16-bit WAV...");

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const dummyCtx = new AudioCtx();
      
      const sampleRate = dummyCtx.sampleRate;
      const totalMixSeconds = 12.0; 
      const renderLength = sampleRate * totalMixSeconds;
      
      await new Promise(r => setTimeout(r, 600));

      const mixBuffer = dummyCtx.createBuffer(2, renderLength, sampleRate);
      const chL = mixBuffer.getChannelData(0);
      const chR = mixBuffer.getChannelData(1);

      const secondsPerBeat = 60.0 / bpm;
      const sixteenthDuration = secondsPerBeat / 4;

      addLog("EXPORTER: Mixing and encoding grid sequencer loops...");

      for (let i = 0; i < renderLength; i++) {
        const time = i / sampleRate;
        const current16thIdx = Math.floor(time / sixteenthDuration) % 16;
        const stepOffset = time % sixteenthDuration;
        
        let sampleAccumL = 0;
        let sampleAccumR = 0;

        // 1) Kick
        if (sequencerGrid[0][current16thIdx] && !mutes[0]) {
          const kickFreq = 140 * Math.exp(-22 * stepOffset);
          const kickVol = 0.5 * Math.exp(-9 * stepOffset) * (volumes[0] / 100);
          const kickWave = Math.sin(2 * Math.PI * kickFreq * stepOffset);
          // Apply panning mapping L vs R
          const p = panning[0];
          sampleAccumL += kickWave * kickVol * (1 - p) * 0.7;
          sampleAccumR += kickWave * kickVol * (1 + p) * 0.7;
        }

        // 2) Hats
        if (sequencerGrid[1][current16thIdx] && !mutes[1]) {
          if (stepOffset < 0.04) {
            const noiseVol = 0.16 * Math.exp(-25 * stepOffset) * (volumes[1] / 100);
            const rawNoise = (Math.random() * 2 - 1) * noiseVol;
            const p = panning[1];
            sampleAccumL += rawNoise * (1 - p) * 0.7;
            sampleAccumR += rawNoise * (1 + p) * 0.7;
          }
        }

        // 3) Synth Lead
        if (sequencerGrid[2][current16thIdx] && !mutes[2]) {
          const scale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
          const freq = scale[current16thIdx % scale.length];
          const synthDecay = 0.45;
          if (stepOffset < synthDecay) {
            const synthVol = 0.16 * Math.exp(-5 * stepOffset) * (volumes[2] / 100);
            let synthWaveSample = 0;
            if (synthWave === 'triangle') {
              synthWaveSample = Math.abs((stepOffset * freq) % 1 - 0.5) * 4 - 1;
            } else if (synthWave === 'square') {
              synthWaveSample = (stepOffset * freq) % 1 < 0.5 ? 1 : -1;
            } else {
              synthWaveSample = Math.sin(2 * Math.PI * freq * stepOffset);
            }
            const p = panning[2];
            sampleAccumL += synthWaveSample * synthVol * (1 - p) * 0.7;
            sampleAccumR += synthWaveSample * synthVol * (1 + p) * 0.7;
          }
        }

        // 4) Sound effect loop trigger / Vocoder stem trigger
        if (uploadedBuffer) {
          const duration = uploadedBuffer.duration;
          const pos = Math.floor((time % duration) * uploadedBuffer.sampleRate);
          const vol = volumes[3] / 100;
          if (pos < uploadedBuffer.length && !mutes[3]) {
            const upL = uploadedBuffer.getChannelData(0)[pos] || 0;
            const upR = (uploadedBuffer.numberOfChannels === 2) 
              ? uploadedBuffer.getChannelData(1)[pos] 
              : upL;
            const p = panning[3];
            sampleAccumL += upL * vol * (1 - p) * 0.75;
            sampleAccumR += upR * vol * (1 + p) * 0.75;
          }
        } else if (sequencerGrid[3][current16thIdx] && !mutes[3]) {
          // Play snappy digital perc
          if (stepOffset < 0.08) {
            const percVol = 0.18 * Math.exp(-15 * stepOffset) * (volumes[3] / 100);
            const percSample = (Math.sin(2 * Math.PI * 820 * stepOffset) + Math.sin(2 * Math.PI * 1150 * stepOffset)) * percVol;
            const p = panning[3];
            sampleAccumL += percSample * (1 - p) * 0.7;
            sampleAccumR += percSample * (1 + p) * 0.7;
          }
        }

        let processedL = sampleAccumL;
        let processedR = sampleAccumR;

        // Apply plugins distortion overdrive
        if (distortionEnabled) {
          const driveScale = distortionDrive * 0.2;
          processedL = Math.tanh(processedL * (1 + driveScale));
          processedR = Math.tanh(processedR * (1 + driveScale));
        }

        // Apply lowpass sweeper
        if (clubFilterEnabled) {
          const cut = clubFilterCutoff / 20000;
          processedL *= cut;
          processedR *= cut;
        }

        // Limiter compression protection
        chL[i] = Math.max(-0.98, Math.min(0.98, processedL * 0.9));
        chR[i] = Math.max(-0.98, Math.min(0.98, processedR * 0.9));
      }

      const wavBlob = encodeWAV(mixBuffer);
      const url = URL.createObjectURL(wavBlob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `Sovereign_DAW_Bandlab_Mix_BPM${bpm}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccessMessage("Master audio mix rendered and downloaded with 16-bit physical stereo panning!");
      addLog(`EXPORTER: Music mix successfully saved: Sovereign_DAW_Bandlab_Mix_BPM${bpm}.wav`);
      setTimeout(() => setDownloadSuccessMessage(null), 7000);
    } catch(err) {
      console.error(err);
      addLog("ERROR: Client-side music rendering failed under heavy multi-sampler allocations.");
    } finally {
      setIsRenderingMix(false);
    }
  };

  const encodeWAV = (audioBuffer: AudioBuffer): Blob => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitDepth = 16;
    
    let interleavedSamples;
    if (numChannels === 2) {
      interleavedSamples = interleaveBuffers(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
    } else {
      interleavedSamples = audioBuffer.getChannelData(0);
    }
    
    const bufferArray = new ArrayBuffer(44 + interleavedSamples.length * 2);
    const view = new DataView(bufferArray);
    
    writeASCIIString(view, 0, 'RIFF');
    view.setUint32(4, 36 + interleavedSamples.length * 2, true);
    writeASCIIString(view, 8, 'WAVE');
    
    writeASCIIString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, numChannels, true); 
    view.setUint32(24, sampleRate, true); 
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); 
    view.setUint16(32, numChannels * (bitDepth / 8), true); 
    view.setUint16(34, bitDepth, true); 
    
    writeASCIIString(view, 36, 'data');
    view.setUint32(40, interleavedSamples.length * 2, true);
    
    writeSamplesToDataView(view, 44, interleavedSamples);
    
    return new Blob([view], { type: 'audio/wav' });
  };

  const interleaveBuffers = (leftChan: Float32Array, rightChan: Float32Array): Float32Array => {
    const length = leftChan.length + rightChan.length;
    const combinedResult = new Float32Array(length);
    let masterIdx = 0;
    let sequenceIdx = 0;
    while (masterIdx < length) {
      combinedResult[masterIdx++] = leftChan[sequenceIdx];
      combinedResult[masterIdx++] = rightChan[sequenceIdx];
      sequenceIdx++;
    }
    return combinedResult;
  };

  const writeSamplesToDataView = (view: DataView, offset: number, inputSamples: Float32Array) => {
    for (let i = 0; i < inputSamples.length; i++, offset += 2) {
      const sampleIntensity = Math.max(-1, Math.min(1, inputSamples[i]));
      view.setInt16(offset, sampleIntensity < 0 ? sampleIntensity * 0x8000 : sampleIntensity * 0x7FFF, true);
    }
  };

  const writeASCIIString = (view: DataView, offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  // Compile standalone executable dashboard HTML
  const generateStandaloneHtmlCode = () => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sovereign DAW Bandlab Standalone</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Space Grotesk', sans-serif; }
    .text-mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="bg-[#05060b] text-[#f3f4f6] min-h-screen flex flex-col p-4 md:p-6 select-none">

  <!-- Header -->
  <div class="max-w-6xl w-full mx-auto flex items-center justify-between border-b border-zinc-900 pb-3 mb-5">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-black border border-[#00FFCC] rounded-xl flex items-center justify-center font-black text-sm text-[#00FFCC]">S</div>
      <div>
        <h1 class="text-sm font-bold uppercase tracking-widest text-white">Sovereign Studio Bandlab Web</h1>
        <p class="text-[9px] text-[#00FFCC] uppercase text-mono">Zero-Latency DSP Sequencer // Standalone edition</p>
      </div>
    </div>
    <div class="text-right">
      <div class="text-[9px] text-[#ff2b55] font-black uppercase text-mono animate-pulse" id="live-status">DRIVER ACTIVE</div>
      <div class="text-[12px] text-zinc-300 font-bold uppercase text-mono tracking-wider mt-0.5" id="time-display">0:00.00</div>
    </div>
  </div>

  <!-- Main Grid -->
  <div class="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-4 gap-4 flex-grow">
    
    <!-- Timeline Screen -->
    <div class="lg:col-span-3 border border-zinc-900 bg-zinc-950 p-3 rounded-xl flex flex-col relative h-[250px] overflow-hidden">
      <canvas id="daw-timeline" class="w-full h-full rounded bg-[#030408]"></canvas>
    </div>

    <!-- Right console -->
    <div class="border border-zinc-900 bg-zinc-950 p-4 rounded-xl flex flex-col justify-between space-y-4">
      <div class="space-y-4">
        <div>
          <label class="text-[9px] uppercase tracking-wider text-mono text-zinc-400 block mb-1">Tempo Control</label>
          <div class="flex gap-2">
            <input type="number" id="bpm-input" value="124" min="40" max="250" class="w-20 bg-black border border-zinc-800 text-[#ffcc00] text-mono text-xs text-center py-2 rounded focus:outline-none" />
            <button id="play-btn" class="flex-grow bg-[#00ffcc] text-black text-[10px] uppercase font-black py-2 rounded tracking-widest transition-all hover:bg-white">PLAY LOOPS</button>
          </div>
        </div>

        <div>
          <label class="text-[9px] uppercase tracking-wider text-mono text-zinc-400 block mb-1">Synthesizer Type</label>
          <div class="grid grid-cols-4 gap-1">
            <button class="wave-opt py-1.5 text-[8px] font-black uppercase border border-[#ffcc00] bg-[#ffcc00]/10 text-[#ffcc00] rounded" onclick="selectWave('triangle', this)">TRI</button>
            <button class="wave-opt py-1.5 text-[8px] font-black uppercase border border-zinc-800 text-zinc-500 rounded" onclick="selectWave('sawtooth', this)">SAW</button>
            <button class="wave-opt py-1.5 text-[8px] font-black uppercase border border-zinc-800 text-zinc-500 rounded" onclick="selectWave('square', this)">SQR</button>
            <button class="wave-opt py-1.5 text-[8px] font-black uppercase border border-zinc-800 text-zinc-500 rounded" onclick="selectWave('sine', this)">SIN</button>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-[9px] uppercase tracking-wider text-mono text-zinc-400 block">Stereo Panning Matrix</label>
          <div class="space-y-1.5 bg-black/40 p-3 rounded border border-zinc-900">
            <div class="flex items-center justify-between text-[8px] text-mono text-zinc-300 gap-1">
              <span>Kick L/R</span>
              <input type="range" id="pan-1" min="-1" max="1" step="0.1" value="0.0" class="flex-1 accent-[#00ffcc] h-1" />
            </div>
            <div class="flex items-center justify-between text-[8px] text-mono text-zinc-300 gap-1">
              <span>Hats L/R</span>
              <input type="range" id="pan-2" min="-1" max="1" step="0.1" value="-0.4" class="flex-1 accent-[#ff3366] h-1" />
            </div>
            <div class="flex items-center justify-between text-[8px] text-mono text-zinc-300 gap-1">
              <span>Synth L/R</span>
              <input type="range" id="pan-3" min="-1" max="1" step="0.1" value="0.4" class="flex-1 accent-[#ffcc00] h-1" />
            </div>
          </div>
        </div>

      </div>
      <div id="terminal-logs" class="bg-black text-[7.5px] text-mono p-2 h-16 border border-zinc-900 rounded overflow-y-hidden text-zinc-450 leading-relaxed">
        &gt; BANDLAB_ENGINE: Ready to run.<br>
        &gt; panning and stereo channels loaded perfectly.
      </div>
    </div>
  </div>

  <script>
    let isPlaying = false;
    let synthWave = 'triangle';
    let audioCtx = null;
    let trackGains = [null, null, null];
    let trackPannerNodes = [null, null, null];
    let mainGain = null;
    let timerID = null;
    let nextNoteTime = 0.0;
    let startTime = 0.0;
    let current16thNote = 0;

    const tracks = [
      { id: 1, name: "Sub Kick Drum", color: "#00ffcc" },
      { id: 2, name: "Snappy Perc Hats", color: "#ff3366" },
      { id: 3, name: "Melodic Lead Synth", color: "#ffcc00" }
    ];

    function writeLog(text) {
      const logger = document.getElementById("terminal-logs");
      logger.innerHTML = "&gt; " + text + "<br>" + logger.innerHTML;
    }

    function initAudio() {
      if (audioCtx) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtx();
        mainGain = audioCtx.createGain();
        mainGain.connect(audioCtx.destination);
        mainGain.gain.setValueAtTime(0.85, audioCtx.currentTime);

        for (let i = 0; i < 3; i++) {
          trackGains[i] = audioCtx.createGain();
          trackPannerNodes[i] = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
          
          if (trackPannerNodes[i]) {
            trackPannerNodes[i].connect(mainGain);
            trackGains[i].connect(trackPannerNodes[i]);
          } else {
            trackGains[i].connect(mainGain);
          }
        }
        writeLog("AUDIO_ENGINE: Built 3 independent gain channels with stereo panning.");
      } catch (e) {
        writeLog("ERROR: Audio environment block.");
      }
    }

    function selectWave(type, btn) {
      synthWave = type;
      document.querySelectorAll(".wave-opt").forEach(b => {
        b.className = "wave-opt py-1.5 text-[8px] font-black uppercase border border-zinc-800 text-zinc-500 rounded";
      });
      btn.className = "wave-opt py-1.5 text-[8px] font-black uppercase border border-[#ffcc00] bg-[#ffcc00]/10 text-[#ffcc00] rounded";
    }

    function playSynthesizedKick(time) {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(32, time + 0.16);
      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(gain);
      gain.connect(trackGains[0]);
      osc.start(time);
      osc.stop(time + 0.2);
    }

    function playSynthesizedHiHat(time) {
      if (!audioCtx) return;
      const count = audioCtx.sampleRate * 0.04;
      const buffer = audioCtx.createBuffer(1, count, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7500, time);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(trackGains[1]);
      noise.start(time);
      noise.stop(time + 0.04);
    }

    function playSynthesizedSynth(time) {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const scale = [261.63, 293.66, 329.63, 392.00];
      const freq = scale[current16thNote % scale.length];
      osc.type = synthWave;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.25, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
      osc.connect(gain);
      gain.connect(trackGains[2]);
      osc.start(time);
      osc.stop(time + 0.4);
    }

    function scheduler() {
      if (!audioCtx || !isPlaying) return;
      while (nextNoteTime < audioCtx.currentTime + 0.12) {
        if (current16thNote % 4 === 0) playSynthesizedKick(nextNoteTime);
        if (current16thNote % 2 === 0 && current16thNote % 4 !== 0) playSynthesizedHiHat(nextNoteTime);
        if (current16thNote % 4 === 2) playSynthesizedSynth(nextNoteTime);

        // Update panning in real time
        const p1 = parseFloat(document.getElementById("pan-1") ? (document.getElementById("pan-1") as HTMLInputElement).value : "0");
        const p2 = parseFloat(document.getElementById("pan-2") ? (document.getElementById("pan-2") as HTMLInputElement).value : "0");
        const p3 = parseFloat(document.getElementById("pan-3") ? (document.getElementById("pan-3") as HTMLInputElement).value : "0");
        if (trackPannerNodes[0] && Number.isFinite(p1) && Number.isFinite(nextNoteTime)) trackPannerNodes[0].pan.setValueAtTime(p1, nextNoteTime);
        if (trackPannerNodes[1] && Number.isFinite(p2) && Number.isFinite(nextNoteTime)) trackPannerNodes[1].pan.setValueAtTime(p2, nextNoteTime);
        if (trackPannerNodes[2] && Number.isFinite(p3) && Number.isFinite(nextNoteTime)) trackPannerNodes[2].pan.setValueAtTime(p3, nextNoteTime);

        const tempo = parseFloat(document.getElementById("bpm-input").value) || 124;
        nextNoteTime += (60.0 / tempo) / 4;
        current16thNote = (current16thNote + 1) % 16;
      }
      timerID = setTimeout(scheduler, 25);
    }

    document.getElementById("play-btn").addEventListener("click", () => {
      initAudio();
      isPlaying = !isPlaying;
      const btn = document.getElementById("play-btn");
      if (isPlaying) {
        btn.innerHTML = "STOP LOOPS";
        btn.className = "flex-grow bg-red-600 text-white text-[10px] uppercase font-black py-2 rounded tracking-widest transition-all hover:bg-white hover:text-black";
        if (audioCtx.state === 'suspended') audioCtx.resume();
        nextNoteTime = audioCtx.currentTime + 0.05;
        startTime = audioCtx.currentTime;
        scheduler();
      } else {
        btn.innerHTML = "PLAY LOOPS";
        btn.className = "flex-grow bg-[#00ffcc] text-black text-[10px] uppercase font-black py-2 rounded tracking-widest transition-all hover:bg-white";
        clearTimeout(timerID);
        document.getElementById("time-display").innerHTML = "0:00.00";
      }
    });

    const canvas = document.getElementById("daw-timeline");
    const ctx = canvas.getContext("2d");
    let width = canvas.width = canvas.clientWidth;
    let height = canvas.height = canvas.clientHeight;

    window.addEventListener("resize", () => {
      width = canvas.width = canvas.clientWidth;
      height = canvas.height = canvas.clientHeight;
    });

    function draw() {
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, width, height);

      const tH = height / 3;
      tracks.forEach((track, j) => {
        const yOffset = j * tH;
        ctx.fillStyle = track.color + '15';
        ctx.fillRect(0, yOffset, width, tH);

        ctx.fillStyle = track.color;
        ctx.font = 'bold 8px monospace';
        ctx.fillText("CH_0" + (j+1) + " // " + track.name.toUpperCase(), 12, yOffset + 14);

        for (let x = 0; x < width; x += 3) {
          const s1 = Math.sin(x * 0.02 + j * 10);
          const wH = Math.abs(s1 * tH * 0.4 * (isPlaying ? 1.0 : 0.3));
          ctx.fillStyle = track.color + (isPlaying ? '99' : '22');
          ctx.fillRect(x, yOffset + tH/2 - wH/2, 1.5, wH);
        }
      });

      if (isPlaying && audioCtx) {
        const elapsed = audioCtx.currentTime - startTime;
        const tempo = parseFloat(document.getElementById("bpm-input").value) || 124;
        const total = (60.0 / tempo) * 4;
        const pct = (elapsed % total) / total;
        const plX = pct * width;

        ctx.fillStyle = '#ff2b55';
        ctx.fillRect(plX - 1, 0, 2, height);

        const m = Math.floor(elapsed / 60);
        const s = Math.floor(elapsed % 60);
        const c = Math.floor((elapsed % 1) * 100);
        document.getElementById("time-display").innerHTML = m + ":" + s.toString().padStart(2, '0') + "." + c.toString().padStart(2, '0');
      }

      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;
  };

  const downloadStandaloneHtmlApp = () => {
    addLog("EXPORTER: Compiling and packaging HTML container...");
    const htmlString = generateStandaloneHtmlCode();
    const blob = new Blob([htmlString], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "Sovereign_DAW_Bandlab_Standalone.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setDownloadSuccessMessage("Successfully compiled and downloaded Standalone Mobile Studio Edition (.html)!");
    addLog("EXPORTER: Single-page responsive HTML application exported.");
    setTimeout(() => setDownloadSuccessMessage(null), 8000);
  };

  const downloadCapacitorWorkspaceZip = async () => {
    setIsZipping(true);
    addLog("EXPORTER: Archiving full Capacitor Workspace directory structure...");
    try {
      const zip = new JSZip();

      const pkgContent = {
        name: "gravelking-autonomous-daw",
        version: "2.5.0",
        description: "Adaptive multitrack Bandlab workflow natively compiled",
        private: true,
        scripts: {
          "build": "echo \"Synthesizer workspace built successfully\"",
          "cap:sync": "cap sync",
          "cap:open": "cap open android"
        },
        dependencies: {
          "@capacitor/android": "^8.3.4",
          "@capacitor/cli": "^8.3.4",
          "@capacitor/core": "^8.3.4"
        }
      };
      zip.file("package.json", JSON.stringify(pkgContent, null, 2));

      const capConfig = {
        appId: "com.allnone.gravelking.daw",
        appName: "Sovereign DAW Bandlab",
        webDir: "www",
        bundledWebRuntime: false,
        server: {
          androidScheme: "https"
        },
        android: {
          androidInsecureFileOperations: true
        }
      };
      zip.file("capacitor.config.json", JSON.stringify(capConfig, null, 2));

      const standaloneHtml = generateStandaloneHtmlCode();
      zip.file("www/index.html", standaloneHtml);

      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.allnone.gravelking.daw">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-feature android:name="android.hardware.audio.low_latency" android:required="true" />
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Sovereign DAW"
        android:usesCleartextTraffic="true">
        <activity
            android:name="com.allnone.gravelking.daw.MainActivity"
            android:label="Sovereign DAW"
            android:launchMode="singleTop"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
      zip.file("android/app/src/main/AndroidManifest.xml", manifestXml);

      const manual = `SOVEREIGN DAW // CAPACITOR COMPILE PROTOCOL
==========================================
1) Extract project zip on your developer workstation.
2) Run NPM install dependencies: npm install
3) Sync and compile native platform: cap sync
4) Open in Android Studio to push onto actual device: cap open android`;
      zip.file("BUILD_MANUAL_ANDROID.txt", manual);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Sovereign_DAW_Bandlab_CapacitorProject.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccessMessage("Success! Packaged Capacitor workspace ZIP. Ready for Android push compilation.");
      addLog("EXPORTER: Capacitor folder pack completed.");
      setTimeout(() => setDownloadSuccessMessage(null), 8500);
    } catch (err) {
      console.error(err);
      addLog("ERROR: Highly-optimized workspace packer crashed during compilation.");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="border border-cyan-500/10 bg-zinc-950 p-4 rounded-xl flex flex-col gap-4 text-mono shadow-[0_0_40px_rgba(0,255,204,0.03)] max-w-7xl mx-auto select-none">
      
      {/* Toast alert system */}
      <AnimatePresence>
        {downloadSuccessMessage && (
          <motion.div 
            key="daw-download-toast-msg"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-[#00FFCC]/10 border border-[#00FFCC] p-3 text-[10px] text-[#00FFCC] uppercase font-black tracking-wider flex items-center justify-between gap-3 rounded"
          >
            <span className="flex items-center gap-2">
              <Check size={14} className="text-[#00FFCC]" />
              {downloadSuccessMessage}
            </span>
            <button 
              onClick={() => setDownloadSuccessMessage(null)}
              className="text-[#00FFCC] hover:text-white font-bold text-xs cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ribbon Title */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center border-b border-zinc-900 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-[#00FFCC]/10 to-[#ff3366]/10 border border-zinc-850 rounded-lg">
            <Music size={20} className="text-[#00FFCC] animate-pulse" />
          </div>
          <div>
            <span className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-1.5">
              Sovereign Bandlab Studio
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[6.5px] font-mono tracking-normal leading-none uppercase">One-Man Army Mode</span>
            </span>
            <p className="text-[8px] text-zinc-500 uppercase mt-0.5">High Performance 16-Bit Multi-Track Sequencer & Dual Space FX Hub</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            disabled={isRenderingMix}
            onClick={renderMasterMixToWavFile}
            className="px-3.5 py-2 text-[8.5px] font-black uppercase text-black bg-[#00FFCC] hover:bg-white rounded border border-[#00FFCC] cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Saves high audio clarity WAV sequence offline directly"
          >
            <Activity size={11} className="animate-pulse" />
            {isRenderingMix ? "RENDERING MIX..." : "RENDER & DOWNLOAD MUSIC MIX (.WAV)"}
          </button>
          <button 
            onClick={downloadStandaloneHtmlApp}
            className="px-3.5 py-2 text-[8.5px] font-black uppercase text-black bg-[#ffcc00] hover:bg-white rounded border border-[#ffcc00] cursor-pointer flex items-center gap-1.5 transition-all"
            title="Download fully offline single-file DAW playable environment"
          >
            <Smartphone size={11} /> Standalone Phone App (.html)
          </button>
          <button 
            disabled={isZipping}
            onClick={downloadCapacitorWorkspaceZip}
            className="px-3.5 py-2 text-[8.5px] font-black uppercase text-white bg-zinc-900 hover:bg-zinc-805 rounded border border-zinc-800 cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Download size={11} />
            {isZipping ? "PACKING ZIP..." : "Pack Capacitor Project (.zip)"}
          </button>
          {onDownloadSystemGuide && (
            <button 
              onClick={onDownloadSystemGuide}
              className="px-3.5 py-2 text-[8.5px] font-black uppercase text-[#D4AF37] bg-black/45 hover:bg-[#D4AF37] hover:text-black rounded border border-[#D4AF37]/50 cursor-pointer flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(212,175,55,0.15)] hover:shadow-[#D4AF37]/30"
              title="Download official professional-grade A4 Sovereign DAW System Guide PDF Report"
            >
              <Sparkles size={11} className="text-[#D4AF37] animate-pulse" />
              Sovereign Guide (.PDF)
            </button>
          )}
        </div>
      </div>

      {/* Preset Loop Packs Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#030408] border border-zinc-900 p-3 rounded-lg">
        {STUDIO_PRESETS.map((p, idx) => (
          <div 
            key={`studio-preset-pack-${idx}-${p.name}`}
            className="bg-black/40 border border-zinc-900 hover:border-zinc-800 p-3 rounded-lg flex flex-col justify-between space-y-2.5 transition-all relative group overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl ${p.color} opacity-[3%] blur-lg group-hover:opacity-10 transition-all`} />
            <div>
              <span className="text-[10px] font-black text-white group-hover:text-[#00ffcc] transition-colors">{p.name}</span>
              <p className="text-[7.5px] text-zinc-400 mt-1 uppercase leading-snug">{p.description}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[7px] font-mono text-zinc-550 border border-zinc-900 px-1 py-0.5 rounded">{p.bpm} BPM</span>
              <button 
                onClick={() => loadPresetLoopPack(idx)}
                className="px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-black bg-white rounded hover:bg-[#00ffcc] transition-all cursor-pointer"
              >
                LOAD PACK
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Main Core Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Multitrack Screen and Flowing Visual Waveform Canvas */}
        <div className="lg:col-span-2 bg-black border border-zinc-900 rounded-lg p-2.5 relative h-[250px] overflow-hidden flex flex-col justify-between">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded" />
          
          <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none opacity-80 z-10">
            {TRACKS_CONFIG.map((t, i) => (
              <span key={`daw-ch-badge-${t.id}-${i}`} className="text-[7px] font-mono font-black uppercase tracking-widest px-1.5 py-0.5 bg-black/85 border border-zinc-900 text-white rounded">
                CH_0{i+1}: {t.name}
              </span>
            ))}
          </div>
          
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-[#ff3366]/10 border border-[#ff3366]/40 text-[#ff3366] px-2 py-1 rounded text-[7.5px] font-bold uppercase animate-pulse z-10 pointer-events-none">
            <Sparkles size={9} /> {isPlaying ? `SWEEPING AT ${bpm} BPM (16TH STEPS PULSE)` : "DAW LOOPS STANDBY"}
          </div>
        </div>

        {/* Master Transport Panel & Microphone deck */}
        <div className="border border-zinc-900 bg-zinc-950 p-3.5 rounded-lg flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <span className="text-[8.5px] text-zinc-500 uppercase font-black tracking-widest pb-1 border-b border-zinc-900 block">Master Transport Console</span>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  initAudio();
                  setIsPlaying(!isPlaying);
                }}
                className={`flex-1 py-2 text-[10px] font-black uppercase border rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer ${isPlaying ? 'bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-emerald-550/10 border-emerald-550 text-emerald-400 hover:bg-emerald-500 hover:text-black hover:border-emerald-500'}`}
              >
                {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                {isPlaying ? "STOP AUDIO" : "IGNITE SEQUENCE"}
              </button>
              
              <button
                onClick={() => {
                  setIsPlaying(false);
                }}
                className="px-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded cursor-pointer transition-colors flex items-center justify-center"
                title="Reset transport sequence"
              >
                <Square size={11} fill="currentColor" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#030408] border border-zinc-900 p-2 text-center rounded">
                <span className="text-[7px] uppercase font-black text-zinc-500 block">Current Playhead</span>
                <span className="text-[11px] font-mono font-black text-[#00FFCC] tabular-nums mt-0.5 block">{timeReadable}</span>
              </div>
              <div className="bg-[#030408] border border-zinc-900 p-2 text-center rounded relative">
                <span className="text-[7px] uppercase font-black text-zinc-500 block">Tempo (BPM)</span>
                <input 
                  type="number" 
                  value={bpm}
                  onChange={(e) => setBpm(Math.max(40, Math.min(250, parseInt(e.target.value) || 124)))}
                  className="w-full bg-transparent border-none text-center font-mono text-[11px] font-black text-[#ffcc00] focus:outline-none focus:ring-0 p-0 mt-0.5 block"
                />
              </div>
            </div>

            {/* Vocal Microphone Recorder integration */}
            <div className="bg-purple-950/15 border border-purple-500/15 p-3 rounded-lg flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase font-black text-purple-400 flex items-center gap-1 tracking-wider">
                  <Mic size={11} className="text-purple-400" /> Web Audio Record Desk
                </span>
                {isRecordingMic && (
                  <span className="text-[7.5px] font-bold text-red-400 animate-pulse uppercase">● Recording ({recordingDuration}s)</span>
                )}
              </div>
              
              <p className="text-[7.5px] text-zinc-400 uppercase leading-snug">
                Connect microphone. Record your vocals in real-time. It automatically decodes and overrides CH_04 loop stem instantly!
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleMicrophoneSession}
                  className={`flex-1 text-[8.5px] uppercase font-black py-2 rounded cursor-pointer transition-all flex items-center justify-center gap-1 border ${isRecordingMic ? 'bg-red-650 text-white border-red-650 animate-pulse' : 'bg-purple-900/40 hover:bg-purple-800/80 text-purple-200 border-purple-600/30'}`}
                >
                  <Mic size={10} />
                  {isRecordingMic ? "FINALIZE CAPTURE" : "RECORD LIVE MICROPHONE"}
                </button>
              </div>

              <div className="border border-dashed border-purple-800/25 bg-black/35 p-2 rounded relative flex items-center justify-between">
                {loadingAudioFile ? (
                  <div className="text-[7.5px] text-purple-300 font-bold uppercase animate-pulse flex items-center gap-1">
                    <RefreshCw size={10} className="animate-spin" /> Compiling PCM Audio stream channels...
                  </div>
                ) : uploadedFileName ? (
                  <div className="text-[7.5px] text-[#00FFCC] font-bold truncate pr-3 flex items-center gap-1">
                    <Check size={10} /> CH_04 ACTIVE: {uploadedFileName}
                  </div>
                ) : (
                  <label className="text-[7.5px] cursor-pointer text-purple-400 font-bold hover:text-white uppercase flex items-center justify-between w-full">
                    <span>UPLOAD DIRECT STEM (.WAV/.MP3)</span>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      onChange={handleStemFileUpload} 
                      className="hidden" 
                    />
                  </label>
                )}
                {uploadedFileName && (
                  <button 
                    onClick={() => {
                      setUploadedBuffer(null);
                      setUploadedFileName(null);
                      addLog("STEMS_LOADER: Active stem channel cleared.");
                    }}
                    className="text-[7px] text-red-400 underline uppercase"
                  >
                    Clear
                  </button>
                )}
              </div>

              {!uploadedFileName && (
                <button
                  type="button"
                  onClick={loadProceduralDemoVoiceStem}
                  className="w-full bg-purple-900 hover:bg-purple-850 text-white text-[7.5px] uppercase font-bold py-1.5 rounded cursor-pointer transition-all"
                >
                  Try Procedural Drone Loop
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Bandlab Style Interactive 16-Step Grid Sequencer Matrix */}
      <div className="border border-zinc-900 bg-zinc-950 p-3.5 rounded-lg space-y-3">
        <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
          <span className="text-[9px] uppercase font-black text-zinc-400 flex items-center gap-1.5">
            <Layers size={12} className="text-[#00ffcc]" /> BandLab Sequencer Grid Multi-Sampler Pads (16 steps)
          </span>
          <span className="text-[7.5px] text-zinc-550 uppercase font-mono">Toggle grid cells to program beats and melodic lines instantly</span>
        </div>

        <div className="space-y-2 mt-2">
          {TRACKS_CONFIG.map((track, trackIdx) => (
            <div key={`daw-seq-row-${track.id}`} className="flex flex-col sm:flex-row items-center gap-3">
              <div className="w-full sm:w-36 flex items-center justify-between text-[8px] text-mono font-black" style={{ color: track.color }}>
                <span className="truncate">{track.name}</span>
                <span className="text-zinc-550 text-[7px] uppercase mr-2 font-light">CH_0{track.id}</span>
              </div>
              <div className="grid grid-cols-16 gap-1 w-full flex-1">
                {Array.from({ length: 16 }).map((_, stepIdx) => {
                  const isActive = sequencerGrid[trackIdx][stepIdx];
                  const isCurrentPosition = currentStep === stepIdx;
                  return (
                    <button
                      key={`daw-seq-step-${track.id}-${stepIdx}`}
                      onClick={() => {
                        setSequencerGrid(prev => {
                          const clone = prev.map((row, rIdx) => {
                            if (rIdx === trackIdx) {
                              const newRow = [...row];
                              newRow[stepIdx] = !newRow[stepIdx];
                              return newRow;
                            }
                            return row;
                          });
                          return clone;
                        });
                      }}
                      className={`h-7 rounded transition-all cursor-pointer relative border ${isActive ? 'shadow-[0_0_8px_rgba(255,255,255,0.05)] text-black font-semibold' : 'border-zinc-900 hover:border-zinc-800'}`}
                      style={{
                        backgroundColor: isActive ? track.color : 'rgba(0,0,0,0.5)',
                        borderColor: isCurrentPosition ? '#ff3366' : isActive ? track.color : ''
                      }}
                    >
                      {isCurrentPosition && (
                        <span className="absolute inset-0 bg-red-500/10 pointer-events-none rounded border-red-500 border animate-pulse" />
                      )}
                      <span className="text-[5.5px] opacity-40 block">{stepIdx + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mixer Level Desk Strip and Stereo Panning Controls */}
      <div className="border border-zinc-900 bg-zinc-950 p-3.5 rounded-lg space-y-3.5">
        <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
          <span className="text-[9px] uppercase font-black text-zinc-400 flex items-center gap-1.5 animate-pulse">
            <Sliders size={12} className="text-[#00ffcc]" /> BandLab Mixing Console Deck (Level / Direct Stereo Panning)
          </span>
          <span className="text-[7.5px] text-zinc-500 uppercase font-mono">Real-time panning and parametric filter shelves</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRACKS_CONFIG.map((track, idx) => (
            <div 
              key={`daw-mixer-strip-${track.id}`}
              className="bg-[#030407] border border-zinc-900 p-3.5 rounded-lg flex flex-col justify-between space-y-3.5 hover:border-zinc-800 transition-all text-mono"
            >
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-white uppercase">{track.name}</span>
                <span className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] animate-pulse" style={{ color: track.color }} />
              </div>

              {/* Mixer Gain Slider control */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[7.5px] text-zinc-500 font-bold uppercase">
                  <span>VOLUME ATTENUATOR</span>
                  <span className="text-white font-mono">{volumes[idx]}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volumes[idx]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setVolumes(prev => {
                        const clone = [...prev];
                        clone[idx] = val;
                        return clone;
                      });
                    }}
                    className="flex-grow accent-[#00ffcc] h-1 bg-zinc-800 rounded appearance-none cursor-pointer"
                  />
                  <button
                    onClick={() => {
                      setMutes(prev => {
                        const clone = [...prev];
                        clone[idx] = !clone[idx];
                        return clone;
                      });
                    }}
                    className={`px-1.5 py-0.5 rounded text-[7px] border cursor-pointer border-zinc-850 uppercase ${mutes[idx] ? 'bg-red-500 text-black font-black' : 'text-zinc-500 hover:text-white'}`}
                  >
                    MUT
                  </button>
                  <button
                    onClick={() => {
                      setSolos(prev => {
                        const clone = [...prev];
                        clone[idx] = !clone[idx];
                        return clone;
                      });
                    }}
                    className={`px-1.5 py-0.5 rounded text-[7px] border cursor-pointer border-zinc-850 uppercase ${solos[idx] ? 'bg-[#ffcc00] text-black font-black' : 'text-zinc-500 hover:text-white'}`}
                  >
                    SOL
                  </button>
                </div>
              </div>

              {/* Stereo field positioning panning slider */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[7.5px] text-zinc-500 font-bold uppercase">
                  <span>Stereo Field Panning</span>
                  <span className="text-[#00FFCC] font-mono">
                    {panning[idx] === 0 ? "CENT" : panning[idx] > 0 ? `R ${panning[idx].toFixed(1)}` : `L ${Math.abs(panning[idx]).toFixed(1)}`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-1.0"
                  max="1.0"
                  step="0.1"
                  value={panning[idx]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setPanning(prev => {
                      const clone = [...prev];
                      clone[idx] = val;
                      return clone;
                    });
                  }}
                  className="w-full accent-[#ff3366] h-1.5 bg-zinc-850 rounded appearance-none cursor-pointer"
                  title="Shift panning to left or right channel"
                />
              </div>

              {/* Equalizers */}
              <div className="space-y-1.5 pt-2.5 border-t border-zinc-900">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[7px] text-zinc-500">
                    <span>LOW SHELF</span>
                    <span className="text-zinc-400">{eqBass[idx] > 0 ? `+${eqBass[idx]}` : eqBass[idx]}dB</span>
                  </div>
                  <input 
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={eqBass[idx]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setEqBass(prev => { const c = [...prev]; c[idx] = v; return c; });
                    }}
                    className="w-full h-1 accent-[#00ffcc] bg-zinc-900 appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[7px] text-zinc-500">
                    <span>MID PEAK</span>
                    <span className="text-zinc-400">{eqMid[idx] > 0 ? `+${eqMid[idx]}` : eqMid[idx]}dB</span>
                  </div>
                  <input 
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={eqMid[idx]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setEqMid(prev => { const c = [...prev]; c[idx] = v; return c; });
                    }}
                    className="w-full h-1 accent-[#ff3366] bg-zinc-900 appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[7px] text-zinc-500">
                    <span>HIGH SHELF</span>
                    <span className="text-zinc-400">{eqTreble[idx] > 0 ? `+${eqTreble[idx]}` : eqTreble[idx]}dB</span>
                  </div>
                  <input 
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={eqTreble[idx]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setEqTreble(prev => { const c = [...prev]; c[idx] = v; return c; });
                    }}
                    className="w-full h-1 accent-[#ffcc00] bg-zinc-900 appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mastering Suite & Physical Reverb DSP panel */}
      <div className="border border-zinc-900 bg-zinc-950 p-4 rounded-lg space-y-3.5">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
          <span className="text-[9.5px] uppercase font-black text-white/90 flex items-center gap-2">
            <Cpu size={13} className="text-[#00FFCC]" /> BandLab Master Mastering Engine & Lush Space Presets
          </span>
          <span className="text-[7.5px] text-zinc-500 uppercase font-mono">Compressor auto-limiters and real physical convolvers</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Master suite limiter compressor */}
          <div className="p-4 bg-black/40 border border-zinc-900 rounded-lg space-y-3.5 relative">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                <Gauge size={12} className="text-cyan-400" /> Professional Dynamics Compressor
              </span>
              <button
                onClick={() => setCompressorEnabled(!compressorEnabled)}
                className={`px-2 py-0.5 text-[7.5px] font-black uppercase rounded cursor-pointer border ${compressorEnabled ? 'bg-cyan-500 border-cyan-500 text-black' : 'border-zinc-800 text-zinc-650'}`}
              >
                {compressorEnabled ? "COMP ACTIVE" : "BYPASSED"}
              </button>
            </div>
            
            <p className="text-[7.5px] text-zinc-400 uppercase leading-snug">
              Ensures high loudness density and professional radio limits without clipping, matching BandLab's online mastering output.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[7px] text-zinc-550">
                  <span>THRESHOLD ATTENUATION</span>
                  <span className="text-white font-bold">{compressorThreshold} dB</span>
                </div>
                <input 
                  type="range"
                  min="-60"
                  max="0"
                  disabled={!compressorEnabled}
                  value={compressorThreshold}
                  onChange={(e) => setCompressorThreshold(parseInt(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-zinc-850 appearance-none cursor-pointer disabled:opacity-20"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[7px] text-zinc-550">
                  <span>RATIO LIMIT STEP</span>
                  <span className="text-white font-bold">{compressorRatio.toFixed(1)}:1</span>
                </div>
                <input 
                  type="range"
                  min="1"
                  max="12"
                  step="0.5"
                  disabled={!compressorEnabled}
                  value={compressorRatio}
                  onChange={(e) => setCompressorRatio(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-zinc-850 appearance-none cursor-pointer disabled:opacity-20"
                />
              </div>
            </div>
          </div>

          {/* Lush Algorithmic Convolver Room Reverb */}
          <div className="p-4 bg-black/40 border border-[#a855f7]/10 border rounded-lg space-y-3.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                <Disc size={12} className="text-[#a855f7] animate-spin" /> Studio Space Convolver (Reverb)
              </span>
              <button
                onClick={() => setReverbEnabled(!reverbEnabled)}
                className={`px-2 py-0.5 text-[7.5px] font-black uppercase rounded cursor-pointer border ${reverbEnabled ? 'bg-[#a855f7] border-[#a855f7] text-white' : 'border-zinc-800 text-zinc-650'}`}
              >
                {reverbEnabled ? "REVERB ACTIVE" : "BYPASSED"}
              </button>
            </div>
            
            <p className="text-[7.5px] text-zinc-400 uppercase leading-snug">
              Simulates a real-world physical recording space by synthesizing an impulse response and folding the audio channels natively.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[7px] text-zinc-550">
                  <span>REVERB LUSH LEVEL (WETNESS)</span>
                  <span className="text-white font-bold">{reverbWetness}%</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max="80"
                  disabled={!reverbEnabled}
                  value={reverbWetness}
                  onChange={(e) => setReverbWetness(parseInt(e.target.value))}
                  className="w-full accent-[#a855f7] h-1 bg-zinc-850 appearance-none cursor-pointer disabled:opacity-20"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[7px] text-zinc-550">
                  <span>ROOM PHYSICAL TAIL (SIZE)</span>
                  <span className="text-white font-bold">{reverbSize.toFixed(1)}s decay</span>
                </div>
                <input 
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.2"
                  disabled={!reverbEnabled}
                  value={reverbSize}
                  onChange={(e) => setReverbSize(parseFloat(e.target.value))}
                  className="w-full h-1 accent-[#a855f7] bg-zinc-850 appearance-none cursor-pointer disabled:opacity-20"
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Secondary FX plugins deck */}
      <div className="border border-zinc-900 bg-zinc-950 p-3.5 rounded-lg space-y-3">
        <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-black block border-b border-zinc-905 pb-1.5 mb-2">Secondary FX Plugin Stems</span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          <div className={`p-3 rounded border ${delayEnabled ? 'border-purple-600/30 bg-purple-950/5' : 'border-zinc-900'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8.5px] font-black text-white uppercase">Echo Space delay</span>
              <input type="checkbox" checked={delayEnabled} onChange={(e) => setDelayEnabled(e.target.checked)} className="cursor-pointer" />
            </div>
            <div className="space-y-2 mt-2">
              <input type="range" min="0.1" max="1.5" step="0.1" disabled={!delayEnabled} value={delayTime} onChange={(e) => setDelayTime(parseFloat(e.target.value))} className="w-full accent-[#a855f7] h-0.5 disabled:opacity-20" />
            </div>
          </div>

          <div className={`p-3 rounded border ${distortionEnabled ? 'border-red-650/30 bg-red-950/5' : 'border-zinc-900'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8.5px] font-black text-white uppercase">Overdrive Saturator</span>
              <input type="checkbox" checked={distortionEnabled} onChange={(e) => setDistortionEnabled(e.target.checked)} className="cursor-pointer" />
            </div>
            <div className="space-y-2 mt-2">
              <input type="range" min="5" max="80" step="5" disabled={!distortionEnabled} value={distortionDrive} onChange={(e) => setDistortionDrive(parseInt(e.target.value))} className="w-full accent-red-500 h-0.5 disabled:opacity-20" />
            </div>
          </div>

          <div className={`p-3 rounded border ${clubFilterEnabled ? 'border-yellow-600/30 bg-yellow-950/5' : 'border-zinc-900'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8.5px] font-black text-white uppercase">Resonant lowpass</span>
              <input type="checkbox" checked={clubFilterEnabled} onChange={(e) => setClubFilterEnabled(e.target.checked)} className="cursor-pointer" />
            </div>
            <div className="space-y-2 mt-2">
              <input type="range" min="200" max="10000" step="100" disabled={!clubFilterEnabled} value={clubFilterCutoff} onChange={(e) => setClubFilterCutoff(parseInt(e.target.value))} className="w-full accent-yellow-550 h-0.5 disabled:opacity-20" />
            </div>
          </div>

        </div>
      </div>

      {/* Melodic Lead Synthesizer Manual Keys */}
      <div className="border border-zinc-900 bg-zinc-950 p-3.5 rounded-lg space-y-3.5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-zinc-900 pb-2 gap-2">
          <span className="text-[9px] uppercase font-black text-zinc-400 flex items-center gap-1.5 font-mono">
            <Cpu size={12} className="text-[#ffcc00]" /> Playable Keyboard Keys (A-S-D-F-G-H-J-K on hardware keyboard)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(['sawtooth', 'triangle', 'square', 'sine'] as const).map(shape => (
              <button
                key={`synth-shape-btn-${shape}`}
                onClick={() => {
                  setSynthWave(shape);
                  addLog(`SYNTH_NODE: Waveform redirected to ${shape.toUpperCase()}.`);
                }}
                className={`px-2.5 py-0.5 text-[8.5px] font-black uppercase rounded cursor-pointer border transition-all ${synthWave === shape ? 'bg-[#ffcc00] border-[#ffcc05] text-black' : 'border-zinc-850 text-zinc-550 hover:text-white'}`}
              >
                {shape}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic piano keys strip */}
        <div className="flex h-16 bg-[#030408] p-1 border border-zinc-900 rounded gap-1 relative select-none">
          {NOTE_FREQUENCIES.map(n => {
            const isKeyPress = activeKeys[n.key];
            return (
              <button
                key={`synth-piano-key-${n.key}`}
                onClick={() => triggerLiveSynthNode(n.freq)}
                className={`flex-1 flex flex-col justify-between items-center py-2 transition-all rounded shadow-sm border border-zinc-900 cursor-pointer ${isKeyPress ? 'bg-[#ffcc00] text-black scale-95 shadow-[0_0_12px_#ffcc00] font-black' : 'bg-white hover:bg-zinc-200 text-zinc-950 hover:border-purple-300'}`}
              >
                <span className="text-[8.5px] font-black uppercase text-center w-full leading-none">{n.note}</span>
                <span className="text-[7px] opacity-40 font-mono tracking-tighter leading-none">[{n.key.toUpperCase()}]</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Diagnostic Console Logs */}
      <div className="bg-black/95 p-3.5 border border-zinc-900 rounded-lg font-mono text-[8px] text-purple-400/90 space-y-1">
        <div className="flex items-center gap-1.5 uppercase font-bold text-white/40 border-b border-zinc-900 pb-1.5 mb-2">
          <Terminal size={11} className="text-[#00FFCC]" />
          <span>Active Device Compiler Terminal Console Signals</span>
        </div>
        {logs.slice(0, 4).map((line, idx) => (
          <div key={`daw-diag-log-${idx}`} className="truncate">
            <span className="text-zinc-650 mr-2">&gt;</span>
            <span>{line}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
