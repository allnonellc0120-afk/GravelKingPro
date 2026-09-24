import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import {
  Bug,
  ChevronDown,
  Grip,
  Loader2,
  Mic,
  MicOff,
  Minimize2,
  Send,
  Sparkles,
  TerminalSquare,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { JAX_VOICE_ENGINE_EVENT } from "@/lib/jaxVoiceEngine";

const OWNER_EMAIL = "allnonellc0120@gmail.com";
const POSITION_KEY = "gkp-jax-widget-position";
const DEFAULT_POSITION = { x: 24, y: 112 };
const MAX_SCAN_BYTES = 60_000;

type ChatTurn = { role: "user" | "model"; text: string };
type Position = { x: number; y: number };
type ConsoleEntry = { level: "error" | "warn"; text: string; at: string };
type PageContext = {
  pathname: string;
  title: string;
  dom: string;
  componentState: string;
  consoleErrors: ConsoleEntry[];
  scanRequested: true;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function readPosition(): Position {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "");
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch {
    // localStorage is optional.
  }
  return DEFAULT_POSITION;
}

function clampPosition(position: Position): Position {
  return {
    x: Math.max(12, Math.min(position.x, Math.max(12, window.innerWidth - 420))),
    y: Math.max(72, Math.min(position.y, Math.max(72, window.innerHeight - 110))),
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? text.trim();
  try {
    const parsed: unknown = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

function compressJaxSal(input: string, maxLength = 120): string {
  const limit = Math.max(1, Math.floor(maxLength) - 1);
  const normalized = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:sure|okay|ok|certainly|absolutely|of course|great|hello|hi|thanks|thank you|understood|as an ai|jax)\b|here(?:'s| is)(?:\s+(?:the\s+)?(?:answer|response|fix))?)\s*[\s,:;—-]*/i, "")
    .replace(/^(?:(?:sure|okay|ok|certainly|absolutely|of course|great|hello|hi|thanks|thank you|understood|as an ai|jax)\b|here(?:'s| is)(?:\s+(?:the\s+)?(?:answer|response|fix))?)\s*[\s,:;—-]*/i, "")
    .replace(/^(?:answer|response|summary|recommendation|action|directive|jax)\s*:\s*/i, "")
    .replace(/\s+(?:sources?|references?|metadata|confidence|risk|verification|files?)\s*:[\s\S]*$/i, "")
    .trim();
  const sentence = normalized.split(/(?<=[.!?])\s+/)
    .find(item => !/^(?:i can|i will|let me|please note|for context|in summary|that said)\b/i.test(item))
    ?? normalized;
  const words = sentence.replace(/^[-*•]\s*/, "").trim().split(/\s+/);
  let compact = "";
  for (const word of words) {
    const next = compact ? `${compact} ${word}` : word;
    if (next.length > limit) break;
    compact = next;
  }
  const trimmed = compact.replace(/[,:;—-]+$/, "") || "JAX standing by";
  return trimmed.length < limit ? `${trimmed}.` : trimmed.slice(0, limit).trimEnd();
}

async function streamJax(
  body: Record<string, unknown>,
  onToken: (text: string) => void,
): Promise<void> {
  const response = await fetch("/api/admin/jax/chat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `JAX returned HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("JAX streaming response is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).find(line => line.startsWith("data:"))?.slice(5).trim();
      if (!data) continue;
      const parsed = JSON.parse(data) as { text?: string; status?: number; error?: string };
      if (parsed.text) onToken(parsed.text);
      if (parsed.status !== undefined && parsed.status !== 0) throw new Error(parsed.error ?? "JAX request failed.");
    }
    if (done) break;
  }
}

export function JaxOwnerWidget() {
  const { user } = useUser();
  const isOwner = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() === OWNER_EMAIL;
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [answer, setAnswer] = useState("");
  const [voiceDirective, setVoiceDirective] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSource, setVoiceSource] = useState<"idle" | "loading" | "founder" | "browser">("idle");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [stagedMessage, setStagedMessage] = useState("");
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const consoleLog = useRef<ConsoleEntry[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const voiceAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    setPosition(clampPosition(readPosition()));
    const originalError = console.error;
    const originalWarn = console.warn;
    const capture = (level: ConsoleEntry["level"], original: (...args: unknown[]) => void, args: unknown[]) => {
      const text = args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ").slice(0, 1000);
      consoleLog.current = [...consoleLog.current.slice(-39), { level, text, at: new Date().toISOString() }];
      original(...args);
    };
    console.error = (...args) => capture("error", originalError, args);
    console.warn = (...args) => capture("warn", originalWarn, args);
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      recognition.current?.stop();
      voiceAudio.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    const onVoiceEngineChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      const enabled = detail?.enabled === true;
      setVoiceEnabled(enabled);
      if (!enabled) {
        voiceAudio.current?.pause();
        window.speechSynthesis?.cancel();
        setSpeaking(false);
        setVoiceSource("idle");
      }
    };
    window.addEventListener(JAX_VOICE_ENGINE_EVENT, onVoiceEngineChange);
    return () => window.removeEventListener(JAX_VOICE_ENGINE_EVENT, onVoiceEngineChange);
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    const onResize = () => setPosition(current => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOwner]);

  const speechConstructor = useMemo(() => {
    if (typeof window === "undefined") return null;
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }, []);

  if (!isOwner) return null;

  const persistPosition = (next: Position) => {
    const safe = clampPosition(next);
    setPosition(safe);
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(safe)); } catch { /* optional */ }
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    dragged.current = false;
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dx = event.clientX - dragStart.current.pointerX;
    const dy = event.clientY - dragStart.current.pointerY;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragged.current = true;
    persistPosition({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
  };

  const finishDrag = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const speakBrowserFallback = (text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    voiceAudio.current?.pause();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.82;
    utterance.onstart = () => { setSpeaking(true); setVoiceSource("browser"); };
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const playFounderVoice = async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;
    voiceAudio.current?.pause();
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setVoiceSource("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 210_000);
    try {
      const response = await fetch("/api/admin/jax/tts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as { audioUrl?: string; error?: string };
      if (!response.ok || !result.audioUrl) {
        throw new Error(result.error ?? `Founder voice returned HTTP ${response.status}`);
      }
      if (!voiceEnabled) return;
      const audio = new Audio(result.audioUrl);
      audio.preload = "auto";
      audio.onplay = () => { setSpeaking(true); setVoiceSource("founder"); };
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => {
        setSpeaking(false);
        speakBrowserFallback(text);
      };
      voiceAudio.current = audio;
      await audio.play();
    } catch {
      speakBrowserFallback(text);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const stopVoice = () => {
    voiceAudio.current?.pause();
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    if (!speechConstructor) {
      setError("Speech input is not available in this browser.");
      return;
    }
    const next = new speechConstructor();
    next.continuous = false;
    next.interimResults = false;
    next.lang = "en-US";
    next.onresult = (event) => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ");
      setPrompt(current => `${current}${current ? " " : ""}${transcript}`.trim());
    };
    next.onerror = () => {
      setListening(false);
      setError("Microphone input stopped before a transcript was captured.");
    };
    next.onend = () => setListening(false);
    recognition.current = next;
    setError("");
    setListening(true);
    next.start();
  };

  const buildPageContext = (): PageContext => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style").forEach(node => node.remove());
    const dom = clone.outerHTML.slice(0, MAX_SCAN_BYTES);
    const fields = Array.from(document.querySelectorAll("input, textarea, select, [data-testid]"))
      .slice(0, 120)
      .map(node => {
        const element = node as HTMLInputElement;
        return {
          tag: node.tagName.toLowerCase(),
          testId: node.getAttribute("data-testid"),
          name: element.name || undefined,
          value: element.type === "password" ? "[redacted]" : element.value?.slice(0, 200),
        };
      });
    return {
      pathname: window.location.pathname,
      title: document.title,
      dom,
      componentState: JSON.stringify({ fields, buttons: document.querySelectorAll("button").length }).slice(0, 12_000),
      consoleErrors: consoleLog.current,
      scanRequested: true,
    };
  };

  const stageProposal = async (rawAnswer: string, pageContext?: PageContext) => {
    const parsed = extractJson(rawAnswer);
    const payload = parsed ?? {
      type: "jax_fix_proposal",
      summary: rawAnswer.slice(0, 12_000),
      changes: [],
      verification: ["Review this proposal manually before applying any change."],
      note: "JAX returned analysis without a machine-readable change list.",
    };
    const response = await fetch("/api/admin/jax/staging", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          ...payload,
          source: "jax-owner-widget",
          path: pageContext?.pathname ?? window.location.pathname,
          generatedAt: new Date().toISOString(),
        },
      }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not send the JSON proposal to staging.");
    setStagedMessage("JSON proposal sent to Admin Control → JAX JSON Staging Box. Nothing was executed.");
  };

  const ask = async (scan = false) => {
    const requested = prompt.trim();
    if (!requested && !scan) return;
    setBusy(true);
    setError("");
    setStagedMessage("");
    setAnswer("");
    setVoiceDirective("");
    const pageContext = scan ? buildPageContext() : undefined;
    const userPrompt = requested || `Scan ${window.location.pathname} for frontend errors and silent logical failures.`;
    const nextHistory = [...messages, { role: "user" as const, text: userPrompt }].slice(-12);
    setMessages(nextHistory);
    try {
      let text = "";
      await streamJax({
        prompt: userPrompt,
        history: messages.slice(-12),
        ...(pageContext ? { pageContext } : {}),
        ...(scan ? { scanMode: "json_fix_proposal" } : {}),
      }, token => {
        text += token;
        setAnswer(text);
      });
      const nextMessages = [...nextHistory, { role: "model" as const, text }];
      setMessages(nextMessages.slice(-12));
      setPrompt("");
      const salText = compressJaxSal(text, 30);
      setVoiceDirective(salText);
      if (voiceEnabled) void playFounderVoice(salText);
      if (scan) await stageProposal(text, pageContext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "JAX could not complete the request.");
    } finally {
      setBusy(false);
    }
  };

  const toggleOpen = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setOpen(value => !value);
  };

  return (
    <div
      className="fixed z-[80] select-none"
      style={{ left: position.x, top: position.y, touchAction: "none" }}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {open && (
        <section
          className="mb-3 flex h-[min(590px,calc(100vh-120px))] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-amber-300/30 bg-zinc-950/95 text-zinc-100 shadow-2xl shadow-black/60 backdrop-blur-xl"
          aria-label="JAX owner engineering copilot"
        >
          <header
            className="flex cursor-grab items-center justify-between border-b border-white/10 bg-amber-400/10 px-4 py-3 active:cursor-grabbing"
            onPointerDown={startDrag}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400 text-zinc-950"><Sparkles className="h-4 w-4" /></div>
              <div><p className="text-sm font-bold">JAX engineering copilot</p><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200/70">owner · Gemini 3.6 Flash</p></div>
            </div>
            <div className="flex items-center gap-1">
              <Grip className="mr-1 h-4 w-4 text-zinc-500" aria-label="Drag JAX" />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Minimize JAX"><Minimize2 className="h-4 w-4" /></button>
            </div>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <div className="rounded-xl border border-violet-300/15 bg-violet-300/5 px-3 py-2 text-xs text-zinc-400">
              Senior platform engineering mode. JAX can inspect this page and propose a JSON fix, but it cannot execute patches, migrations, or shell commands.
            </div>
            {messages.slice(-6).map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "ml-7 bg-white/10" : "mr-3 border border-amber-300/15 bg-amber-300/5"}`}>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">{message.role === "user" ? "You" : "JAX"}</p>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
              </div>
            ))}
            {busy && !answer && <div className="flex items-center gap-2 px-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Inspecting live context…</div>}
            {answer && busy && (
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-sm">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-200/70">JAX live response</p>
                <p className="whitespace-pre-wrap break-words">{answer}</p>
              </div>
            )}
            {stagedMessage && <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-200">{stagedMessage}</p>}
            {voiceDirective && <p className="rounded-lg border border-sky-300/15 bg-sky-300/5 px-3 py-2 text-xs text-sky-200/80"><span className="mr-1 font-mono text-[9px] uppercase tracking-[0.14em] text-sky-300/60">SAL</span>{voiceDirective}</p>}
            {voiceSource !== "idle" && <p className="px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">{voiceSource === "loading" ? "Founder voice · synthesizing" : voiceSource === "founder" ? "Founder voice · RVC checkpoint" : "Voice fallback · browser synthesis"}</p>}
            {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
          </div>
          <div className="space-y-2 border-t border-white/10 p-3">
            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void ask(); }}
              maxLength={4000}
              rows={3}
              placeholder="Describe a bug or ask JAX to inspect this page…"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-300/50"
              aria-label="Ask JAX"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void ask(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/25 px-2.5 py-2 text-xs text-violet-200 hover:bg-violet-300/10 disabled:opacity-50"><Bug className="h-3.5 w-3.5" />Scan page</button>
              <button type="button" onClick={toggleMic} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs ${listening ? "border-rose-300/50 bg-rose-300/10 text-rose-200" : "border-white/10 text-zinc-300 hover:bg-white/10"}`} aria-pressed={listening}>{listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}{listening ? "Stop mic" : "Speak"}</button>
              <button type="button" onClick={() => { if (speaking) stopVoice(); else void playFounderVoice(answer); }} disabled={!answer || voiceSource === "loading"} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40" aria-label={speaking ? "Stop JAX voice" : "Play JAX voice"}>{speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}{speaking ? "Stop voice" : voiceSource === "loading" ? "Building voice…" : "Play voice"}</button>
              <button type="button" onClick={() => void ask()} disabled={busy || !prompt.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Ask JAX</button>
            </div>
          </div>
        </section>
      )}
      {!open && (
        <button
          type="button"
          onClick={toggleOpen}
          onPointerDown={startDrag}
          className="group flex h-14 w-14 cursor-grab items-center justify-center rounded-2xl border border-amber-200/50 bg-zinc-950/90 text-amber-300 shadow-xl shadow-black/50 backdrop-blur active:cursor-grabbing"
          aria-label="Open JAX engineering copilot"
          title="Drag JAX or click to open"
        >
          <span className="absolute h-10 w-10 animate-ping rounded-xl bg-amber-300/10 group-hover:bg-amber-300/20" />
          <TerminalSquare className="relative h-6 w-6" />
        </button>
      )}
      {open && <button type="button" onClick={() => setOpen(false)} className="sr-only">Close JAX</button>}
    </div>
  );
}