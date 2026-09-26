import { useState, useEffect, useRef } from 'react';
import { Terminal, Brain, Send, Cpu, Key, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function DeepLocalLLM() {
  const [messages, setMessages] = useState<{ sender: 'user' | 'system' | 'ai'; text: string }[]>([
    { sender: 'system', text: 'DEEP-LOCAL CORE: Sub-GHz secure neural handshake completed.' },
    { sender: 'ai', text: 'Greetings, Sovereign. Deep-Local personal LLM client is loaded fully offline within your browser. Select a seed query or type your instruction. Standard operations locked to 1T peak throughput.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [tokensPerSec, setTokensPerSec] = useState(94.2);
  const [vramUsage, setVramUsage] = useState(7.4);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const presetQueries = [
    "Compile dual-stem Morris Law stabilizers",
    "Describe GravelKing cryptographic quorums",
    "Calculate genomic sequence drift indexes",
  ];

  const handleQuery = async (queryText: string) => {
    if (isTyping || !queryText.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text: queryText }]);
    setInputValue('');
    setIsTyping(true);

    const q = queryText.toLowerCase();
    let responseText = "";

    if (q.includes("stabilizers") || q.includes("stabilizer") || q.includes("morris")) {
      responseText = "MORRIS LAW STABILIZATION SIGNATURES:\n\n1. Parity Logic (75% reduction matrix): locks active memory bridges into tight linear bounds, enforcing perfect stability ratings (Q=1.0000).\n2. Dynamic Drift Thumpers: actively throttle hardware heat spikes by rearranging redundant instruction streams in dual parallel stems.\n3. Sovereign Interlock: forces synchronous JIT compilers to verify logic invariants before yielding frame pipelines.";
    } else if (q.includes("cryptographic") || q.includes("quorum") || q.includes("gravelking")) {
      responseText = "GRAVELKING PROTOCOL CRYPTOGRAPHIC QUORUM:\n\nBy distributing verification weights across parallel hardware sectors, we create a secure decentral pipeline where no thread can execute out of sync. Deep-carve session hashes are injected directly into localized VRAM arrays, protecting against buffer overruns and securing physical hardware signatures.";
    } else if (q.includes("genomic") || q.includes("drift") || q.includes("sequence")) {
      responseText = "GENOMIC SEQUENCE DRIFT INFERENCE:\n\nComparing standard sequential alignment algorithms under heavy 1T load, the standard sequence drift index shoots past 12.4% due to CPU cache desynchronization. Morris Law Kernel handles base-pair alignment within local registers, reducing physical drift offsets to absolute zero (0.00% drift).";
    } else {
      responseText = `Executing local analytical model core...\n\nSovereign 1T Instruction validated successfully. Handshake code: SECURE-DEEP-CORE-${Math.floor(1000 + Math.random() * 9000)}. Computing multi-layered answers instantly using cached logic registers. Perfect parity certified.`;
    }

    setTokensPerSec(98.5 + Math.random() * 5);
    setVramUsage(7.4 + Math.random() * 0.4);

    // Stream response letter-by-letter / word-by-word
    let currentText = "";
    const words = responseText.split(" ");
    let i = 0;

    const streamInterval = setInterval(() => {
      if (i < words.length) {
        currentText += (i === 0 ? "" : " ") + words[i];
        setMessages(prev => {
          const base = prev.slice(0, -1);
          const last = prev[prev.length - 1];
          if (last && last.sender === 'ai' && prev.length > messages.length) {
            return [...base, { sender: 'ai', text: currentText }];
          }
          return [...prev, { sender: 'ai', text: currentText }];
        });
        i++;
      } else {
        clearInterval(streamInterval);
        setIsTyping(false);
      }
    }, 60);
  };

  return (
    <div className="border border-blue-500/20 bg-zinc-950 p-4 rounded-lg flex flex-col gap-4 text-mono shadow-[0_0_20px_rgba(59,130,246,0.05)]">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-blue-500" />
          <span className="text-xs font-black uppercase text-blue-500">Deep-Local Personal LLM Workspace</span>
        </div>
        <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
          Total Privacy // Client-Side neural net offline
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Presets and System stats */}
        <div className="space-y-4 lg:col-span-1">
          <div>
            <div className="text-[9px] text-white/40 font-black uppercase tracking-wider mb-2">Seed Directives</div>
            <div className="space-y-1.5">
              {presetQueries.map((q, qIdx) => (
                <button
                  key={`preset-query-${qIdx}-${q.slice(0, 10)}`}
                  disabled={isTyping}
                  onClick={() => handleQuery(q)}
                  className="w-full text-left p-2 border border-zinc-850 hover:border-blue-500/50 bg-black hover:bg-blue-500/5 text-white/70 hover:text-white text-[10px] uppercase font-black tracking-tighter leading-snug rounded transition-all disabled:opacity-40"
                >
                  &rarr; {q}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-black border border-zinc-900 rounded space-y-2">
            <div className="flex justify-between items-center text-[10px] uppercase font-black">
              <span className="text-white/40">Tokens Rate:</span>
              <span className="text-emerald-400 font-bold">{tokensPerSec.toFixed(1)} T/S</span>
            </div>
            <div className="flex justify-between items-center text-[10px] uppercase font-black">
              <span className="text-white/40">Allocated VRAM:</span>
              <span className="text-blue-400 font-bold">{vramUsage.toFixed(2)} GB</span>
            </div>
            <div className="flex justify-between items-center text-[10px] uppercase font-black">
              <span className="text-white/40">Context Lock:</span>
              <span className="text-amber-400 font-bold">128K Quorum</span>
            </div>
          </div>
        </div>

        {/* Dynamic Chat Hub */}
        <div className="flex flex-col border border-zinc-900 bg-black rounded p-3 lg:col-span-3 h-[280px]">
          <div className="flex-1 overflow-y-auto space-y-3 p-1 scrollbar-thin">
            {messages.map((m, idx) => (
              <div
                key={`llm-msg-${idx}-${m.sender}`}
                className={`max-w-[85%] text-xs flex flex-col gap-1 ${
                  m.sender === 'user' ? 'ml-auto text-right' : 'mr-auto text-left'
                }`}
              >
                <span className={`text-[8px] uppercase tracking-wider font-bold ${
                  m.sender === 'user' ? 'text-blue-400' : m.sender === 'system' ? 'text-[#00FFCC]' : 'text-zinc-500'
                }`}>
                  {m.sender === 'user' ? 'User' : m.sender === 'system' ? 'INTEGRITY ENGINE' : 'DEEP-LLM'}
                </span>
                <div className={`p-2.5 rounded whitespace-pre-wrap leading-relaxed ${
                  m.sender === 'user' 
                    ? 'bg-blue-500/10 border border-blue-500/30 text-blue-200' 
                    : m.sender === 'system'
                    ? 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 font-bold italic'
                    : 'bg-zinc-950 border border-zinc-900 text-white/90'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="mr-auto text-left max-w-[85%] text-xs flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-wider text-blue-500 font-bold">DEEP-LLM</span>
                <div className="p-2.5 bg-zinc-950 border border-zinc-900 text-white/50 tracking-widest flex items-center gap-1">
                  CORE CALCULATING
                  <span className="animate-ping text-[#00FFCC] font-black">.</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputValue.trim()) {
                handleQuery(inputValue);
              }
            }}
            className="flex gap-2 border-t border-zinc-900 pt-3 mt-2"
          >
            <input
              type="text"
              disabled={isTyping}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Inject neural directive..."
              className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-white text-xs outline-none focus:border-blue-500/60 font-mono rounded"
            />
            <button
              type="submit"
              disabled={isTyping || !inputValue.trim()}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500 border border-blue-500/50 hover:text-black text-blue-400 font-black text-xs uppercase rounded transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              <Send size={12} /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
