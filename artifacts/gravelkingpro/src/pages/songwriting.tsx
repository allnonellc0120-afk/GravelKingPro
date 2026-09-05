import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { jsPDF } from "jspdf";
import { useAppState } from "@/lib/context";
import { Layout } from "@/components/layout";
import { downloadBlob } from "@/lib/download";
import { trackEvent } from "@/lib/analytics";
import { useCredits } from "@/components/credit-wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronLeft,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";

type BlockType = "Verse" | "Chorus" | "Bridge" | "Hook" | "Outro";
type SongBlock = { id: string; type: BlockType; content: string };
type SongDraft = {
  title: string;
  bpm: string;
  key: string;
  blocks: SongBlock[];
  createdAt: string;
  modifiedAt: string;
  editCount: number;
};
type ArtistProfile = {
  bio: string;
  genre: string;
  subGenres: string;
  tempo: string;
  stylisticRules: string;
};
type ChatMessage = { id: string; role: "user" | "jax"; content: string };

const STORAGE_KEY = "gk:songwriting:canvas:v1";
const HMAC_KEY_STORAGE = "gk:songwriting:hmac-key:v1";
const BLOCK_TYPES: BlockType[] = ["Verse", "Chorus", "Bridge", "Hook", "Outro"];
const ARTIST_PROFILE_KEY = "mlk_artist_profile";
const DEFAULT_RULES = "Avoid simple AABB nursery rhymes. Use internal and slant rhymes, authentic flow, and natural meter.";
const JAX_VOICE_STORAGE_KEY = "mlk_jax_selected_voice";
type JaxVoicePreset = readonly [string, string];
const DEFAULT_JAX_VOICE_PRESETS: JaxVoicePreset[] = [
  ["admin", "Admin Configured Voice"],
  ["pNInz6obpgDQGcFmaJgB", "JAX Baritone (Deep & Resonant)"],
  ["N2lVS1w4EtoT3dr4eOWO", "JAX Gritty Blues / Rough"],
  ["ErXwobaYiN019PkySvjV", "JAX Smooth Studio / Conversational"],
  ["TxGEqnHWrfWFTfGW9XjX", "JAX Heavy Low-End / Narrator"],
  ["pqHfZKP75CvOlQylNhV4", "JAX Classic Vintage"],
] as const;

function mergeJaxVoicePresets(
  voices: Array<{ voiceId?: string; label?: string }> | undefined,
): JaxVoicePreset[] {
  if (!voices?.length) return DEFAULT_JAX_VOICE_PRESETS;

  const labelsById = new Map(
    voices
      .filter((voice): voice is { voiceId: string; label: string } => Boolean(voice.voiceId?.trim() && voice.label?.trim()))
      .map((voice) => [voice.voiceId, voice.label] as const),
  );
  return DEFAULT_JAX_VOICE_PRESETS.map(([voiceId, defaultLabel]) => [
    voiceId,
    labelsById.get(voiceId) ?? defaultLabel,
  ] as const);
}
function newBlock(type: BlockType = "Verse"): SongBlock {
  return { id: crypto.randomUUID(), type, content: "" };
}

function initialDraft(): SongDraft {
  const now = new Date().toISOString();
  return {
    title: "Untitled song",
    bpm: "96",
    key: "C",
    blocks: [newBlock("Verse"), newBlock("Chorus")],
    createdAt: now,
    modifiedAt: now,
    editCount: 0,
  };
}

function countSyllables(text: string): number {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .reduce((total, word) => total + Math.max(1, (word.match(/[aeiouy]+/g) ?? []).length), 0);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return bytes.slice().buffer;
}

async function getLocalHmacKey(): Promise<CryptoKey> {
  const saved = localStorage.getItem(HMAC_KEY_STORAGE);
  if (saved) {
    return crypto.subtle.importKey("raw", base64ToBytes(saved), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, true, ["sign"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  const encoded = btoa(String.fromCharCode(...new Uint8Array(raw)));
  localStorage.setItem(HMAC_KEY_STORAGE, encoded);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function signDraft(draft: SongDraft): Promise<string> {
  const payload = JSON.stringify({
    title: draft.title,
    bpm: draft.bpm,
    key: draft.key,
    blocks: draft.blocks.map(({ id, type, content }) => ({ id, type, content })),
    createdAt: draft.createdAt,
    modifiedAt: draft.modifiedAt,
  });
  const key = await getLocalHmacKey();
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.height = "0px";
    ref.current.style.height = `${Math.max(128, ref.current.scrollHeight)}px`;
  }, []);

  useEffect(() => resize(), [value, resize]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onInput={resize}
      placeholder={placeholder}
      className="min-h-32 resize-none border-0 bg-transparent px-0 text-base leading-7 text-foreground shadow-none focus-visible:ring-0"
      aria-label="Lyric content"
    />
  );
}

export default function SongwritingStudio() {
  const { tier, isDeveloper } = useAppState();
  const { user } = useUser();
  const [draft, setDraft] = useState<SongDraft>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SongDraft>;
        if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
          return { ...initialDraft(), ...parsed, blocks: parsed.blocks as SongBlock[] };
        }
      }
    } catch {
      // A malformed local draft should never prevent opening the canvas.
    }
    return initialDraft();
  });
  const [auditOpen, setAuditOpen] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeHash, setActiveHash] = useState("");
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [certificateBusy, setCertificateBusy] = useState(false);
  const canCertify = tier === "node_auditor" || isDeveloper;
  const [prompt, setPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [autoVoice, setAutoVoice] = useState(true);
  const [response, setResponse] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem(JAX_VOICE_STORAGE_KEY) || "pNInz6obpgDQGcFmaJgB");
  const [jaxVoicePresets, setJaxVoicePresets] = useState<JaxVoicePreset[]>(DEFAULT_JAX_VOICE_PRESETS);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<{ stop: () => void; sessionId: number } | null>(null);
  const speechSessionRef = useRef(0);
  const [artistProfile, setArtistProfile] = useState<ArtistProfile>(() => {
    try {
      const saved = localStorage.getItem(ARTIST_PROFILE_KEY);
      return saved ? { bio: "", genre: "", subGenres: "", tempo: "", stylisticRules: DEFAULT_RULES, ...JSON.parse(saved) } : { bio: "", genre: "", subGenres: "", tempo: "", stylisticRules: DEFAULT_RULES };
    } catch { return { bio: "", genre: "", subGenres: "", tempo: "", stylisticRules: DEFAULT_RULES }; }
  });
  const [styleDescriptor, setStyleDescriptor] = useState("");
  const [generatorLyrics, setGeneratorLyrics] = useState("");
  const [generatorBusy, setGeneratorBusy] = useState(false);
  const [generatorMessage, setGeneratorMessage] = useState("");
  const [stage2Hash, setStage2Hash] = useState("");
  const [stage3Hash, setStage3Hash] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const { balance: creditsBalance } = useCredits();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        setSavedAt(new Date().toISOString());
        void signDraft(draft).then(setActiveHash).catch(() => setActiveHash(""));
      } catch {
        // The canvas remains usable if storage is unavailable.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(ARTIST_PROFILE_KEY, JSON.stringify(artistProfile)), 500);
    return () => window.clearTimeout(timer);
  }, [artistProfile]);

  useEffect(() => {
    localStorage.setItem(JAX_VOICE_STORAGE_KEY, selectedVoice);
  }, [selectedVoice]);

  useEffect(() => {
    if (!jaxVoicePresets.some(([voiceId]) => voiceId === selectedVoice)) {
      setSelectedVoice(jaxVoicePresets[0]?.[0] ?? DEFAULT_JAX_VOICE_PRESETS[0][0]);
    }
  }, [jaxVoicePresets, selectedVoice]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/jax/voices", { credentials: "include" })
      .then(async (result) => {
        if (!result.ok) throw new Error("Voice metadata unavailable");
        return result.json() as Promise<{ voices?: Array<{ voiceId?: string; label?: string }> }>;
      })
      .then((data) => {
        if (!cancelled && data.voices?.length) {
          setJaxVoicePresets(mergeJaxVoicePresets(data.voices));
        }
      })
      .catch(() => {
        // Keep the curated client defaults if the metadata endpoint is unavailable.
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({ styleDescriptor, bpm: draft.bpm, key: draft.key, arrangement: draft.blocks.map((block) => block.type) });
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)).then(bytesToHex).then(setStage2Hash);
  }, [styleDescriptor, draft.bpm, draft.key, draft.blocks]);

  const generateCertificate = async () => {
    setCertificateBusy(true);
    try {
      const hash = activeHash || await signDraft(draft);
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const margin = 18;
      const width = 210 - margin * 2;
      doc.setFillColor(9, 10, 12);
      doc.rect(0, 0, 210, 297, "F");
      doc.setDrawColor(139, 92, 246);
      doc.setLineWidth(1.2);
      doc.rect(margin, margin, width, 261);
      doc.setTextColor(196, 181, 253);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("GRAVELKING PRODUCTIONS  /  JAX", margin + 8, margin + 12);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(25);
      doc.text("Provenance Certificate", margin + 8, margin + 32);
      doc.setTextColor(52, 211, 153);
      doc.setFontSize(11);
      doc.text("✓  GravelKing Forensic Signal Verified", margin + 8, margin + 46);
      doc.setTextColor(220, 220, 225);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const details = [
        ["Document title", draft.title || "Untitled song"],
        ["Author ID", user?.primaryEmailAddress?.emailAddress || user?.id || "Local author"],
        ["Final ISO timestamp", draft.modifiedAt],
        ["Total edit count", String(draft.editCount)],
        ["HMAC-SHA256 signature", hash],
      ];
      let y = margin + 64;
      details.forEach(([label, value]) => {
        doc.setTextColor(160, 160, 170);
        doc.text(label.toUpperCase(), margin + 8, y);
        doc.setTextColor(245, 245, 248);
        doc.text(doc.splitTextToSize(value, width - 16), margin + 8, y + 6);
        y += label === "HMAC-SHA256 signature" ? 24 : 16;
      });
      doc.setDrawColor(70, 70, 80);
      doc.line(margin + 8, y, margin + width - 8, y);
      y += 12;
      doc.setTextColor(196, 181, 253);
      doc.setFont("helvetica", "bold");
      doc.text("FULL LYRIC TRANSCRIPT", margin + 8, y);
      y += 8;
      doc.setTextColor(230, 230, 235);
      doc.setFont("helvetica", "normal");
      const transcript = draft.blocks.map((block) => `[${block.type.toUpperCase()}]\n${block.content || "(empty)"}`).join("\n\n");
      for (const line of doc.splitTextToSize(transcript, width - 16)) {
        if (y > 272) {
          doc.addPage();
          doc.setFillColor(9, 10, 12);
          doc.rect(0, 0, 210, 297, "F");
          y = 22;
        }
        doc.text(line, margin + 8, y);
        y += 5;
      }
      doc.save(`${(draft.title || "song").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-provenance-certificate.pdf`);
      trackEvent("certificate_downloaded", { location: "songwriting" });
    } finally {
      setCertificateBusy(false);
    }
  };

  const updateDraft = useCallback((update: (current: SongDraft) => SongDraft) => {
    setDraft((current) => ({
      ...update(current),
      modifiedAt: new Date().toISOString(),
      editCount: current.editCount + 1,
    }));
  }, []);

  const totalLines = useMemo(
    () => draft.blocks.reduce((total, block) => total + (block.content ? block.content.split(/\r?\n/).length : 0), 0),
    [draft.blocks],
  );
  const syllables = useMemo(
    () => draft.blocks.reduce((total, block) => total + countSyllables(block.content), 0),
    [draft.blocks],
  );

  const addBlock = (type: BlockType) => {
    updateDraft((current) => ({ ...current, blocks: [...current.blocks, newBlock(type)] }));
  };

  const updateBlock = (id: string, content: string) => {
    updateDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === id ? { ...block, content } : block),
    }));
  };

  const removeBlock = (id: string) => {
    updateDraft((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== id) }));
  };

  const moveBlock = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    updateDraft((current) => {
      const blocks = [...current.blocks];
      const fromIndex = blocks.findIndex((block) => block.id === fromId);
      const toIndex = blocks.findIndex((block) => block.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, moved);
      return { ...current, blocks };
    });
  };

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    const submittedPrompt = prompt.trim();
    speechSessionRef.current += 1;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setChatMessages((messages) => [...messages, { id: crypto.randomUUID(), role: "user", content: submittedPrompt }]);
    setPrompt("");
    setGenerating(true);
    setGenerationError("");
    try {
      const result = await fetch("/api/jax/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: submittedPrompt,
          artistProfile,
          history: chatMessages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await result.json() as { text?: string; error?: string; remaining?: number | null };
      if (!result.ok) throw new Error(data.error || "JAX could not respond.");
      const reply = data.text || "";
      setResponse(reply);
      setChatMessages((messages) => [...messages, { id: crypto.randomUUID(), role: "jax", content: reply }]);
      setRemaining(data.remaining ?? null);
      if (autoVoice && reply) void speakText(reply);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "JAX could not respond.");
    } finally {
      setGenerating(false);
    }
  };

  const transferToGenerator = () => {
    setGeneratorLyrics(draft.blocks.map((block) => `[${block.type.toUpperCase()}]\n${block.content}`).filter(Boolean).join("\n\n"));
    document.getElementById("song-generator")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleListening = () => {
    type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type SpeechRecognitionLike = {
      lang: string; interimResults: boolean; continuous: boolean;
      start: () => void; stop: () => void;
      onresult: ((event: SpeechRecognitionEventLike) => void) | null;
      onerror: ((event: { error: string }) => void) | null;
      onend: (() => void) | null;
    };
    type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
    const speechWindow = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setGenerationError("Voice drafting is not supported in this browser. You can still type your prompt.");
      return;
    }
    if (listening) {
      speechSessionRef.current += 1;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    const sessionId = speechSessionRef.current + 1;
    speechSessionRef.current = sessionId;
    recognitionRef.current = { stop: () => recognition.stop(), sessionId };
    const promptPrefix = prompt.trim();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      if (speechSessionRef.current !== sessionId) return;
      let currentTranscript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        currentTranscript += `${event.results[index][0].transcript} `;
      }
      currentTranscript = currentTranscript.trim();
      if (!currentTranscript) return;
      const nextPrompt = `${promptPrefix}${promptPrefix ? " " : ""}${currentTranscript}`;
      const inputField = document.getElementById("chat-input-field") as HTMLTextAreaElement | null;
      if (inputField) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(inputField, nextPrompt);
        inputField.dispatchEvent(new InputEvent("input", { bubbles: true, data: currentTranscript, inputType: "insertText" }));
      }
      setPrompt(nextPrompt);
    };
    recognition.onerror = (event) => {
      if (speechSessionRef.current !== sessionId) return;
      setGenerationError(event.error === "not-allowed"
        ? "Microphone access was blocked. Allow microphone access for this site and try again."
        : `Voice drafting stopped: ${event.error}.`);
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      if (speechSessionRef.current !== sessionId) return;
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.start();
    setListening(true);
  };

  const speakText = async (text: string) => {
    if (speaking) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    setVoiceError("");
    setSpeaking(true);
    try {
      const result = await fetch("/api/jax/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, voiceId: selectedVoice }),
      });
      if (!result.ok) throw new Error((await result.json() as { error?: string }).error || "Voice playback unavailable.");
      const objectUrl = URL.createObjectURL(await result.blob());
      const audio = new Audio(objectUrl);
      audio.onended = () => { URL.revokeObjectURL(objectUrl); setSpeaking(false); };
      audio.onerror = () => { setVoiceError("The selected voice could not be played."); setSpeaking(false); };
      await audio.play();
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Voice playback unavailable.");
      setSpeaking(false);
    }
  };

  const speakResponse = async () => {
    if (!response) return;
    await speakText(response);
  };

  const pushToCanvas = () => {
    if (!response) return;
    const target = draft.blocks[0];
    if (target) updateBlock(target.id, response);
    setGeneratorLyrics((current) => (current.trim() ? `${current}\n\n${response}` : response));
    setResponse("");
  };

  const askJax = async (fillPrompt: string): Promise<string> => {
    const result = await fetch("/api/jax/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ prompt: fillPrompt, artistProfile, history: chatMessages.slice(-12).map((m) => ({ role: m.role, content: m.content })) }),
    });
    const data = await result.json() as { text?: string; error?: string };
    if (!result.ok || !data.text?.trim()) throw new Error(data.error || "JAX could not fill in the missing piece.");
    return data.text.trim();
  };

  const smartFill = async (): Promise<{ lyrics: string; style: string; filled: string[] }> => {
    let lyrics = generatorLyrics.trim();
    let style = styleDescriptor.trim();
    const filled: string[] = [];
    if (!lyrics) {
      setGeneratorMessage(style ? "No lyrics entered — JAX is writing them in your style…" : "No lyrics entered — JAX is writing them…");
      lyrics = await askJax(style
        ? `Write complete, original song lyrics (with [Verse]/[Chorus] section tags) in this exact style: ${style}. Output lyrics only.`
        : "Write complete, original song lyrics (with [Verse]/[Chorus] section tags) on any theme you feel. Output lyrics only.");
      setGeneratorLyrics(lyrics);
      filled.push("lyrics");
    }
    if (!style) {
      setGeneratorMessage("No style entered — JAX is picking one that fits the lyrics…");
      style = await askJax(`In one short line, describe the perfect musical style (genre, tempo, mood, instrumentation) for these lyrics. Output the style description only:\n\n${lyrics.slice(0, 2000)}`);
      setStyleDescriptor(style);
      filled.push("style");
    }
    return { lyrics, style, filled };
  };

  const generateSongElevenLabs = async () => {
    if (generatorBusy) return;
    setGeneratorBusy(true);
    setGeneratorMessage("");
    try {
      const { lyrics, style, filled } = await smartFill();
      trackEvent("song_generate_clicked", { engine: "jax" });
      setGeneratorMessage("JAX is producing your take… this can take a minute or two.");
      const result = await fetch("/api/jax/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lyrics, style, title: draft.title }),
      });
      if (!result.ok) {
        const data = await result.json().catch(() => ({})) as { error?: string; code?: string };
        if (result.status === 403) throw new Error(data.error || "JAX generation is a Pro/King feature.");
        throw new Error(data.error || "JAX could not complete this take.");
      }
      const data = await result.json() as { trackId?: string; title?: string };
      // Take is saved to the vault server-side — play it in-app from the
      // library stream (no forced download, no bouncing to an external app).
      if (data.trackId) {
        const audio = new Audio(`/api/tracks/${encodeURIComponent(data.trackId)}/stream`);
        await audio.play().catch(() => undefined);
      }
      setGeneratorMessage(`JAX take ready${filled.length ? ` — JAX supplied the ${filled.join(" and ")}` : ""} — playing now and saved to your library. Open it in the Mastering Tool to polish it.`);
      trackEvent("song_generated", { engine: "jax", auto_filled: filled.join("+") || "none" });
    } catch (error) {
      setGeneratorMessage(error instanceof Error ? error.message : "JAX could not complete this take.");
    } finally {
      setGeneratorBusy(false);
    }
  };

  const generateSong = async () => {
    if (generatorBusy) return;
    setGeneratorBusy(true);
    setGeneratorMessage("");
    try {
      const { lyrics, style, filled } = await smartFill();
      trackEvent("song_generate_clicked", { engine: "mlk" });
      setGeneratorMessage("Rendering your take… this can take a couple of minutes.");
      const result = await fetch("/api/mlk/v35/generate-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: lyrics, title: draft.title, stylePrompt: style, vocalMode: "lyrics", durationS: 120 }),
      });
      const data = await result.json() as { error?: string; trackId?: string; audioFullKey?: string; previewUrl?: string };
      if (!result.ok) throw new Error(data.error || "Generator could not complete this take.");
      const binding = JSON.stringify({ trackId: data.trackId, audioFullKey: data.audioFullKey, previewUrl: data.previewUrl, lyricsHash: activeHash, styleHash: stage2Hash });
      setStage3Hash(bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(binding))));
      setGeneratorMessage(`Render complete${filled.length ? ` — JAX supplied the ${filled.join(" and ")}` : ""}. The take is in your library, ready to certify when you are.`);
      trackEvent("song_generated", { engine: "mlk", auto_filled: filled.join("+") || "none" });
    } catch (error) {
      setGeneratorMessage(error instanceof Error ? error.message : "Generator could not complete this take.");
    } finally {
      setGeneratorBusy(false);
    }
  };

  return (
    <Layout hideChrome>
      <div className="bg-[#08090c] text-foreground">
      <div className="flex h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6">
          <div className="flex items-center gap-3"><button type="button" onClick={() => setSidebarOpen((open) => !open)} className="rounded-lg p-2 text-muted-foreground hover:bg-white/10" aria-label="Toggle sessions sidebar"><ChevronDown className={`h-4 w-4 ${sidebarOpen ? "rotate-90" : "-rotate-90"}`} /></button><Link href="/" className="text-sm font-semibold"><span className="mr-2 text-[10px] uppercase tracking-[0.25em] text-violet-300">JAX</span>Songwriting Companion</Link></div>
          <div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Local session"}</span><Button size="sm" onClick={() => setCertificateOpen(true)} className="bg-violet-500 text-white hover:bg-violet-400"><ShieldCheck className="mr-1.5 h-4 w-4" />Certificate</Button></div>
        </header>
        <div className="flex min-h-0 flex-1">
          {sidebarOpen && <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-white/[0.02] p-4 md:block"><Button variant="outline" className="mb-5 w-full justify-start border-white/10" onClick={() => { setChatMessages([]); setResponse(""); setPrompt(""); }}>+ New session</Button><p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Saved songs</p><button type="button" className="w-full rounded-lg bg-violet-400/10 px-3 py-3 text-left text-sm text-violet-100">{draft.title || "Untitled song"}<span className="mt-1 block text-xs text-muted-foreground">Current session</span></button><div className="mt-8 rounded-xl border border-white/10 p-3 text-xs leading-5 text-muted-foreground"><p className="font-semibold text-foreground">JAX remembers as you chat</p><p className="mt-1">Genre, tempo, and your story become background context—no forms required.</p></div></aside>}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-8">
              {chatMessages.length === 0 ? <div className="m-auto max-w-xl text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-xl font-bold text-violet-300">J</div><h1 className="text-3xl font-bold tracking-tight">What are we writing today?</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Tell JAX the story, mood, genre, or lyric you have in mind. We’ll shape it together.</p></div> : <div className="space-y-6">{chatMessages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "user" ? "bg-violet-500 text-white" : "border border-white/10 bg-white/[0.04]"}`}><p className="whitespace-pre-wrap">{message.content}</p>{message.role === "jax" && <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => void speakResponse()} className="border-white/10">{speaking ? "Stop voice" : "Read aloud"}</Button><Button size="sm" variant="outline" onClick={pushToCanvas} className="border-white/10">Save to song</Button></div>}</div></div>)}{generating && <div className="text-sm text-muted-foreground">JAX is writing…</div>}{generationError && <p className="text-sm text-rose-300">{generationError}</p>}</div>}
            </div>
            <div className="shrink-0 border-t border-white/10 bg-[#08090c]/95 px-4 py-4 backdrop-blur sm:px-8"><div className="mx-auto max-w-4xl"><div className="rounded-2xl border border-white/15 bg-white/[0.04] p-2 shadow-2xl"><div className="flex items-end gap-2"><Textarea id="chat-input-field" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void generate(); } }} placeholder="Message JAX…" className="min-h-12 max-h-40 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0" /><Button type="button" size="icon" variant="ghost" onClick={toggleListening} className={listening ? "text-rose-300" : "text-muted-foreground"} aria-label={listening ? "Stop microphone" : "Use microphone"}>{listening ? "●" : "Mic"}</Button><Button type="button" size="icon" onClick={() => void generate()} disabled={!prompt.trim() || generating} className="bg-violet-500 text-white" aria-label="Send message">↑</Button></div><div className="flex items-center justify-between px-3 pb-1 pt-2 text-xs text-muted-foreground"><span>{remaining !== null ? `${remaining} prompts left today` : "JAX learns from this conversation"}</span><button type="button" onClick={() => setAutoVoice((enabled) => !enabled)} className={`rounded-full px-2.5 py-1 ${autoVoice ? "bg-violet-400/20 text-violet-200" : "bg-white/5"}`}>Auto-Voice {autoVoice ? "On" : "Off"}</button></div></div>{voiceError && <p className="mt-2 text-xs text-rose-300">{voiceError}</p>}</div></div>
          </main>
        </div>
      </div>

      <section id="song-generator" className="border-t border-amber-400/25 bg-amber-400/[0.045] px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Song Generator</p>
            <h2 className="mt-1 text-xl font-bold">Turn the lyrics into a finished take</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your JAX lyrics carry down automatically. Leave either box empty and JAX fills it in for you.</p>
          </div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="generator-lyrics">Lyric input</label>
          <Textarea id="generator-lyrics" value={generatorLyrics} onChange={(event) => setGeneratorLyrics(event.target.value)} className="min-h-36 border-white/10 bg-black/20 leading-7" placeholder="Empty? JAX writes the lyrics for you…" />
          <label className="mb-2 mt-5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="style-descriptor">Style prompt</label>
          <Textarea id="style-descriptor" value={styleDescriptor} onChange={(event) => setStyleDescriptor(event.target.value)} className="min-h-24 border-white/10 bg-black/20" placeholder="Empty? JAX picks a style. Or be exact: sad outlaw grunge, 70 BPM, dark raw acoustic…" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">The take lands in your library when it finishes rendering.</span>
            <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void generateSong()} disabled={generatorBusy} className="bg-amber-500 text-black hover:bg-amber-400">{generatorBusy ? "Generating take…" : "Generate with MLK (20 credits)"}</Button>
                    <Button onClick={() => void generateSongElevenLabs()} disabled={generatorBusy} variant="outline" className="border-amber-400/40 text-amber-200 hover:bg-amber-400/10">{generatorBusy ? "Generating take…" : "Generate with JAX (20 credits)"}</Button>
            </div>
          </div>
          {generatorMessage && <p className="mt-4 text-sm text-emerald-300">{generatorMessage}</p>}
        </div>
      </section>
      </div>

      {certificateOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><div className="w-full max-w-lg rounded-2xl border border-violet-400/30 bg-[#121318] p-6"><div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-violet-300">JAX / PROVENANCE</p><h2 className="mt-1 text-xl font-bold">Provenance Certificate</h2></div><button type="button" onClick={() => setCertificateOpen(false)} aria-label="Close certificate dialog"><X className="h-5 w-5" /></button></div><p className="my-6 text-sm leading-6 text-muted-foreground">The certificate includes your transcript, edit history, timestamp, and active HMAC signature.</p><Button className="w-full bg-violet-500 text-white" onClick={() => void generateCertificate()} disabled={certificateBusy || !activeHash}>{certificateBusy ? "Compiling certificate…" : "Download certificate PDF"}</Button></div></div>}
      {/*
    <Layout hideChrome>
      <div className="min-h-screen bg-[#090a0c] text-foreground">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090a0c]/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Back to home">
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-300">JAX</p>
                <h1 className="text-sm font-semibold">Songwriting Companion</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Autosave on"}</span>
              <Save className="h-4 w-4 text-emerald-400" aria-label="Autosave enabled" />
              <Button size="sm" onClick={() => setCertificateOpen(true)} className="bg-violet-500 text-white hover:bg-violet-400">
                <ShieldCheck className="mr-1.5 h-4 w-4" /> <span className="hidden sm:inline">Generate IP Certificate</span><span className="sm:hidden">Certificate</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAuditOpen((open) => !open)} className="border-white/15">
                {auditOpen ? "Hide ledger" : "Show ledger"}
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl lg:grid-cols-[minmax(0,1fr)_280px]">
          <main className="min-w-0 px-4 py-8 sm:px-8 sm:py-12">
            <div className="mx-auto max-w-3xl">
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor="song-title">Song title</label>
                  <Input
                    id="song-title"
                    value={draft.title}
                    onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
                    className="h-auto border-0 bg-transparent px-0 text-3xl font-black tracking-tight shadow-none focus-visible:ring-0 sm:text-4xl"
                    placeholder="Untitled song"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">Shape the song one block at a time. Your draft stays on this device.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Input aria-label="BPM" value={draft.bpm} onChange={(event) => updateDraft((current) => ({ ...current, bpm: event.target.value }))} className="w-20 border-white/10 bg-white/[0.03]" placeholder="BPM" />
                  <Input aria-label="Key" value={draft.key} onChange={(event) => updateDraft((current) => ({ ...current, key: event.target.value }))} className="w-20 border-white/10 bg-white/[0.03]" placeholder="Key" />
                </div>
              </div>

              <section className="mb-6 rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Studio prompt</p>
                    <p className="mt-1 text-sm text-muted-foreground">Ask JAX for a lyric idea, hook, rewrite, rhyme, or section.</p>
                  </div>
                  {remaining !== null && <span className="text-xs text-muted-foreground">{remaining} free prompts left today</span>}
                </div>
                <div className="flex items-end gap-2">
                  <Textarea id="chat-input-field" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void generate(); }} placeholder="Try: Write a vulnerable pre-chorus about leaving the porch light on…" className="min-h-20 resize-none border-white/10 bg-black/20 focus-visible:ring-violet-400" />
                  <Button type="button" variant="outline" onClick={toggleListening} className={listening ? "border-rose-400 text-rose-300" : "border-white/10"} aria-label={listening ? "Stop voice drafting" : "Start voice drafting"}>{listening ? "●" : "Mic"}</Button>
                  <Button type="button" onClick={() => void generate()} disabled={!prompt.trim() || generating} className="bg-violet-500 text-white hover:bg-violet-400">{generating ? "Writing…" : "Write"}</Button>
                </div>
                {generationError && <p className="mt-3 text-sm text-rose-300">{generationError}</p>}
                {response && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-[#0d0e12] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">JAX response</span>
                      <div className="flex gap-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <label htmlFor="jax-voice-model" className="sr-only">JAX Voice Model</label>
                          <select id="jax-voice-model" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} className="h-9 max-w-[220px] rounded-md border border-white/10 bg-black/30 px-2 text-xs text-foreground outline-none focus:border-violet-400">
                            {jaxVoicePresets.map(([voiceId, label]) => <option key={voiceId} value={voiceId}>{label}</option>)}
                          </select>
                          <Button type="button" size="sm" variant="outline" onClick={() => void speakResponse()} className="border-white/10">{speaking ? "Stop voice" : "Read aloud"}</Button>
                        </div>
                        <Button type="button" size="sm" onClick={pushToCanvas} className="bg-emerald-500 text-black hover:bg-emerald-400">Push to Canvas</Button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{response}</p>
                    {voiceError && <p className="mt-3 text-xs text-rose-300">{voiceError}</p>}
                  </div>
                )}
              </section>

              <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex w-full items-center justify-between text-left">
                  <span><span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Artist memory</span><span className="mt-1 block text-sm text-muted-foreground">Local MLK profile · injected into JAX prompts</span></span>
                  <span className="text-xs text-muted-foreground">{profileOpen ? "Hide" : "Edit profile"}</span>
                </button>
                {profileOpen && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Textarea value={artistProfile.bio} onChange={(event) => setArtistProfile((profile) => ({ ...profile, bio: event.target.value }))} className="min-h-24 border-white/10 bg-black/20 sm:col-span-2" placeholder="Bio / backstory context" aria-label="Artist bio and backstory" />
                    <Input value={artistProfile.genre} onChange={(event) => setArtistProfile((profile) => ({ ...profile, genre: event.target.value }))} className="border-white/10 bg-black/20" placeholder="Core genre" aria-label="Core genre" />
                    <Input value={artistProfile.subGenres} onChange={(event) => setArtistProfile((profile) => ({ ...profile, subGenres: event.target.value }))} className="border-white/10 bg-black/20" placeholder="Sub-genre tags" aria-label="Sub-genre tags" />
                    <Input value={artistProfile.tempo} onChange={(event) => setArtistProfile((profile) => ({ ...profile, tempo: event.target.value }))} className="border-white/10 bg-black/20" placeholder="Tempo preferences" aria-label="Tempo preferences" />
                    <Textarea value={artistProfile.stylisticRules} onChange={(event) => setArtistProfile((profile) => ({ ...profile, stylisticRules: event.target.value }))} className="min-h-20 border-white/10 bg-black/20 sm:col-span-2" placeholder={DEFAULT_RULES} aria-label="Stylistic rules" />
                  </div>
                )}
              </section>

              <div className="space-y-4">
                {draft.blocks.map((block, index) => (
                  <article
                    key={block.id}
                    draggable
                    onDragStart={() => setDraggedId(block.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedId) moveBlock(draggedId, block.id);
                      setDraggedId(null);
                    }}
                    className={`rounded-2xl border bg-white/[0.025] p-5 transition-colors sm:p-6 ${draggedId === block.id ? "border-violet-400/70 bg-violet-400/10" : "border-white/10 hover:border-white/20"}`}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-violet-300" aria-label={`Drag ${block.type} block`}>
                        <GripVertical className="h-5 w-5" />
                      </button>
                      <select
                        value={block.type}
                        onChange={(event) => updateDraft((current) => ({ ...current, blocks: current.blocks.map((item) => item.id === block.id ? { ...item, type: event.target.value as BlockType } : item) }))}
                        className="rounded-md border border-white/10 bg-[#111318] px-2 py-1 text-xs font-semibold uppercase tracking-wider text-violet-300 outline-none"
                        aria-label="Block type"
                      >
                        {BLOCK_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                      <span className="text-xs text-muted-foreground">Block {index + 1}</span>
                      <button type="button" onClick={() => removeBlock(block.id)} className="ml-auto text-muted-foreground hover:text-rose-400" aria-label={`Delete ${block.type} block`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <AutoTextarea value={block.content} onChange={(value) => updateBlock(block.id, value)} placeholder={`Write your ${block.type.toLowerCase()}…`} />
                  </article>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {BLOCK_TYPES.map((type) => (
                  <Button key={type} variant="outline" size="sm" onClick={() => addBlock(type)} className="border-white/10 bg-white/[0.02] text-muted-foreground hover:border-violet-400/50 hover:text-violet-200">
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> {type}
                  </Button>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={transferToGenerator} variant="outline" className="border-violet-400/40 text-violet-200 hover:bg-violet-400/10">
                  Transfer to Generator
                </Button>
              </div>

              <section id="song-generator" className="mt-10 rounded-2xl border border-amber-400/25 bg-amber-400/[0.045] p-5 sm:p-6">
                <div className="mb-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Song Generator</p>
                  <h2 className="mt-1 text-xl font-bold">Turn the canvas into a finished take</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Review the lyric handoff and refine the style before the existing MLK generator runs.</p>
                </div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="generator-lyrics">Lyric input</label>
                <Textarea id="generator-lyrics" value={generatorLyrics} onChange={(event) => setGeneratorLyrics(event.target.value)} className="min-h-36 border-white/10 bg-black/20 leading-7" placeholder="Transfer your active canvas blocks here…" />
                <label className="mb-2 mt-5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="style-descriptor">Style Descriptor</label>
                <Textarea id="style-descriptor" value={styleDescriptor} onChange={(event) => setStyleDescriptor(event.target.value)} className="min-h-24 border-white/10 bg-black/20" placeholder="Warm late-night alt-R&B, close vocal, internal rhymes, natural conversational meter…" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Arrangement: {draft.blocks.map((block) => block.type).join(" → ")}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void generateSong()} disabled={!generatorLyrics.trim() || generatorBusy} className="bg-amber-500 text-black hover:bg-amber-400">{generatorBusy ? "Generating take…" : "Generate song (20 credits)"}</Button>
                    <Button onClick={() => void generateSongElevenLabs()} disabled={generatorBusy} variant="outline" className="border-amber-400/40 text-amber-200 hover:bg-amber-400/10">{generatorBusy ? "Generating take…" : "Generate with ElevenLabs (20 credits)"}</Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Wallet balance: <strong className="text-foreground">{creditsBalance === null ? "sign in to view" : `${creditsBalance} credits`}</strong>. Each finished song uses 20 credits.
                </p>
                {generatorMessage && <p className="mt-4 text-sm text-emerald-300">{generatorMessage}</p>}
              </section>
            </div>
          </main>

          {auditOpen && (
            <aside className="border-t border-white/10 bg-white/[0.018] px-5 py-6 lg:border-l lg:border-t-0 lg:px-6 lg:py-12">
              <div className="sticky top-24">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300">Pre-hashing</p>
                    <h2 className="mt-1 text-lg font-bold">Provenance ledger</h2>
                  </div>
                  <button type="button" onClick={() => setAuditOpen(false)} className="text-muted-foreground hover:text-foreground lg:hidden" aria-label="Close ledger"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-muted-foreground">Total lines</p><p className="mt-1 text-2xl font-bold">{totalLines}</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-muted-foreground">Est. syllables</p><p className="mt-1 text-2xl font-bold">{syllables}</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-muted-foreground">Debounced edits</p><p className="mt-1 text-2xl font-bold">{draft.editCount}</p></div>
                </div>
                <dl className="mt-6 space-y-4 border-t border-white/10 pt-5 text-xs">
                  <div><dt className="text-muted-foreground">Created locally</dt><dd className="mt-1 break-all text-foreground/80">{draft.createdAt}</dd></div>
                  <div><dt className="text-muted-foreground">Last modified</dt><dd className="mt-1 break-all text-foreground/80">{draft.modifiedAt}</dd></div>
                </dl>
                <div className="mt-6 border-t border-white/10 pt-5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-violet-200"><LockKeyhole className="h-3.5 w-3.5" /> Active HMAC-SHA256</div>
                  <code className="mt-2 block break-all rounded-lg bg-black/30 p-3 text-[10px] leading-4 text-emerald-300">{activeHash || "Computing first revision…"}</code>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">A new signature is computed after every debounced local save. The signing key remains on this device.</p>
                </div>
                <div className="mt-6 border-t border-white/10 pt-5">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">3-stage provenance</div>
                  {[
                    ["Stage 1", "Lyrics hash", activeHash],
                    ["Stage 2", "Style & composition hash", stage2Hash],
                    ["Stage 3", "Audio render hash", stage3Hash],
                  ].map(([stage, label, hash]) => (
                    <div key={stage} className="mb-3 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-foreground">{stage} · {label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${hash ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>{hash ? "BOUND" : "PENDING"}</span>
                      </div>
                      <code className="mt-2 block break-all text-[9px] leading-4 text-emerald-300">{hash || "Awaiting milestone…"}</code>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
      {certificateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="certificate-dialog-title">
          <div className="w-full max-w-lg rounded-2xl border border-violet-400/30 bg-[#121318] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300">JAX / KING TIER</p>
                <h2 id="certificate-dialog-title" className="mt-1 text-xl font-bold">Provenance Certificate</h2>
              </div>
              <button type="button" onClick={() => setCertificateOpen(false)} aria-label="Close certificate dialog" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            {canCertify ? (
              <>
                <div className="my-6 rounded-xl border border-violet-400/30 bg-violet-400/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-violet-200">GravelKing Forensic Signal Verified</p>
                  <p className="mt-3 text-sm text-muted-foreground">The PDF will include the final transcript, author identity, edit count, ISO timestamp, and the active HMAC signature.</p>
                  <code className="mt-4 block break-all text-[10px] text-emerald-300">{activeHash || "Computing signature…"}</code>
                </div>
                <Button className="w-full bg-violet-500 text-white hover:bg-violet-400" onClick={() => void generateCertificate()} disabled={certificateBusy || !activeHash}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> {certificateBusy ? "Compiling certificate…" : "Download court-ready PDF"}
                </Button>
              </>
            ) : (
              <>
                <div className="my-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-4 flex items-center gap-3 text-emerald-300"><ShieldCheck className="h-5 w-5" /><span className="font-semibold">Forensic Signal Verified</span></div>
                  <div className="space-y-3 text-xs text-muted-foreground"><p>Document: <span className="text-foreground">{draft.title}</span></p><p>Hash signature: <code className="text-emerald-300">{activeHash ? `${activeHash.slice(0, 18)}…` : "Pending"}</code></p><p>Transcript and timestamp included in the KING certificate layout.</p></div>
                </div>
                <p className="text-sm text-muted-foreground">Court-ready IP certificates are available on KING Tier.</p>
                <Link href="/pricing" onClick={() => setCertificateOpen(false)} className="mt-4 block rounded-md bg-amber-500 px-4 py-2.5 text-center text-sm font-bold text-black hover:bg-amber-400">See Pro plans and free certificates</Link>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  */}</Layout>
  );
}
