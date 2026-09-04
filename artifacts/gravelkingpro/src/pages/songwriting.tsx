import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
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

const STORAGE_KEY = "gk:songwriting:canvas:v1";
const BLOCK_TYPES: BlockType[] = ["Verse", "Chorus", "Bridge", "Hook", "Outro"];

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        setSavedAt(new Date().toISOString());
      } catch {
        // The canvas remains usable if storage is unavailable.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);

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

  return (
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
                <p className="mt-6 text-xs leading-relaxed text-muted-foreground">This ledger is local to your device. Hashing and certification are intentionally not connected in this canvas step.</p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </Layout>
  );
}