import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ShieldCheck, Fingerprint, Clock, Copy, Check, ChevronDown, ChevronUp,
  FileText, Loader2, Music2, ArrowRight, Plus,
} from "lucide-react";

interface LyricImport {
  id: string;
  contentHash: string;
  hashAlgorithm: string;
  stampType: string;
  importedText: string;
  charCount: number;
  certifiedHumanAuthor: boolean;
  certificationText: string | null;
  stampedAt: string;
  createdAt: string;
}

function formatStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function HashChip({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-amber-400 transition-colors"
      title="Copy full SHA-256 hash"
    >
      <Fingerprint className="w-3.5 h-3.5 shrink-0 text-amber-500/70" />
      <span className="truncate">{hash.slice(0, 24)}…{hash.slice(-8)}</span>
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </button>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      {children}
    </div>
  );
}

function ImportCard({ item }: { item: LyricImport }) {
  const [open, setOpen] = useState(false);
  const preview = item.importedText.replace(/\s+/g, " ").trim().slice(0, 160);
  const truncated = item.importedText.trim().length > 160;
  return (
    <Card className="border-border/40 bg-card/60 overflow-hidden">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-amber-500/70" />
            <span className="font-medium">{formatStamp(item.stampedAt)}</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 shrink-0">
            <ShieldCheck className="w-3 h-3" /> Imported · 100% Human
          </span>
        </div>

        <HashChip hash={item.contentHash} />

        <p className="text-sm text-foreground/80 leading-relaxed">
          {preview}{truncated ? "…" : ""}
        </p>

        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          data-testid={`button-expand-${item.id}`}
        >
          {open
            ? <><ChevronUp className="w-3.5 h-3.5" />Hide full details</>
            : <><ChevronDown className="w-3.5 h-3.5" />View full stamped details</>}
        </button>

        {open && (
          <div className="space-y-4 pt-3 border-t border-border/40">
            <Detail label="Full lyrics (exact text at rest)">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/85 bg-background/50 rounded-lg p-3 border border-border/40 max-h-80 overflow-auto">{item.importedText}</pre>
            </Detail>
            <Detail label="Classification">
              <span className="text-sm text-foreground/85">
                {item.stampType === "imported_human_original"
                  ? "Imported — 100% human original (kept separate from AI-collab drafts)"
                  : item.stampType}
              </span>
            </Detail>
            <div className="grid sm:grid-cols-2 gap-4">
              <Detail label={`${item.hashAlgorithm.toUpperCase()} content hash`}>
                <code className="block break-all font-mono text-[11px] text-amber-300/90 bg-background/50 rounded-lg p-2.5 border border-border/40">{item.contentHash}</code>
              </Detail>
              <Detail label="Official server timestamp">
                <span className="text-sm text-foreground/85">{formatStamp(item.stampedAt)}</span>
              </Detail>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Detail label="Characters stamped">
                <span className="text-sm text-foreground/85">{item.charCount.toLocaleString()}</span>
              </Detail>
              <Detail label="Certification">
                <span className="text-sm text-foreground/85">{item.certificationText ?? "Certified human author"}</span>
              </Detail>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              This record proves the exact text existed in your account at the server timestamp above.
              The {item.hashAlgorithm.toUpperCase()} hash lets anyone independently verify the words behind this stamp have not changed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProtectedLyrics() {
  const { toast } = useToast();
  const [items, setItems] = useState<LyricImport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/lyrics/imports", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (alive) setItems(Array.isArray(data.imports) ? data.imports : []);
      } catch {
        if (alive) toast({ title: "Could not load your protected lyrics", variant: "destructive" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [toast]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-500" />
            <span className="text-xs font-bold tracking-widest uppercase text-amber-500">IP Vault</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">My Protected Lyrics</h1>
          <p className="text-muted-foreground text-sm max-w-lg">
            Every set of lyrics you've stamped as your own. Each entry carries a cryptographic
            SHA-256 hash and an official server timestamp — a tamper-evident record of when you
            possessed the exact text.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-10 text-center space-y-4">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="font-semibold">No stamped lyrics yet</p>
                <p className="text-sm text-muted-foreground">
                  Import your own lyrics in the Songwriting Studio to create your first IP possession stamp.
                </p>
              </div>
              <Link
                href="/songwriting"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-black bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-md transition-colors"
              >
                <Music2 className="w-4 h-4" /> Go to Songwriting <ArrowRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {items.length} stamped {items.length === 1 ? "entry" : "entries"}
              </p>
              <Link
                href="/songwriting"
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Stamp new lyrics
              </Link>
            </div>
            {items.map((item) => <ImportCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}
