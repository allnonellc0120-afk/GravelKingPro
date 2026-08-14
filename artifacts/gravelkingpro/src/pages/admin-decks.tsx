import { Layout } from "@/components/layout";
import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink, FileText, Presentation, Globe, LayoutDashboard,
  Lock, Zap, BookOpen, ShieldCheck,
} from "lucide-react";

interface DeckEntry {
  title: string;
  description: string;
  type: "slides" | "web" | "doc" | "tool";
  href: string;
  external?: boolean;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  note?: string;
}

const DECKS: DeckEntry[] = [
  {
    title: "Morris Law Kernel v3.5 — Pitch Deck",
    description: "Full investor / partner pitch deck for the MLK v3.5 audio AI engine. Covers architecture, benchmarks, market, and licensing model.",
    type: "slides",
    href: "/mlk-pitch-deck",
    external: true,
    badge: "Slides",
    badgeColor: "border-violet-500/40 text-violet-400",
    icon: <Presentation className="w-5 h-5 text-violet-400" />,
    note: "Registered artifact — opens in the slides preview. Share the direct link with investors only.",
  },
  {
    title: "MLK V3.5 Licensing Platform",
    description: "Partner-facing licensing site for the Morris Law Kernel matrix-multiplication engine. Separate from the audio GravelKing product.",
    type: "web",
    href: "/mlk-licensing",
    external: true,
    badge: "Web App",
    badgeColor: "border-amber-500/40 text-amber-400",
    icon: <Globe className="w-5 h-5 text-amber-400" />,
    note: "Registered artifact — live web app. Do NOT link from public GravelKing nav (separate product).",
  },
  {
    title: "GravelKing Pro — Internal Pitch / Strategy",
    description: "Internal HTML strategy reference. Covers product pillars, feature gates, and GTM notes.",
    type: "doc",
    href: "/admin/ops",
    badge: "Internal",
    badgeColor: "border-sky-500/40 text-sky-400",
    icon: <FileText className="w-5 h-5 text-sky-400" />,
    note: "Lives inside Admin Ops. No public URL.",
  },
  {
    title: "Admin Publish Checklist",
    description: "Pre-launch verification checklist — privacy links, Play store status, Stripe webhooks, Clerk redirects.",
    type: "tool",
    href: "/admin/publish-checklist",
    badge: "Checklist",
    badgeColor: "border-emerald-500/40 text-emerald-400",
    icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
  },
  {
    title: "GravelKing Whitepaper",
    description: "Public-facing technical whitepaper on IP certification and the MLK audio kernel. Safe to share with press and labels.",
    type: "doc",
    href: "/whitepaper",
    badge: "Public",
    badgeColor: "border-rose-500/40 text-rose-300",
    icon: <BookOpen className="w-5 h-5 text-rose-300" />,
    note: "This page IS public — it's linked here for your reference only.",
  },
  {
    title: "Admin Analytics Dashboard",
    description: "Funnel conversion events, pageview trends, trial starts, and subscription activations.",
    type: "tool",
    href: "/admin",
    badge: "Live Data",
    badgeColor: "border-emerald-500/40 text-emerald-400",
    icon: <LayoutDashboard className="w-5 h-5 text-emerald-400" />,
  },
];

function TypeBadge({ type }: { type: DeckEntry["type"] }) {
  const map: Record<DeckEntry["type"], string> = {
    slides: "bg-violet-500/10 text-violet-400",
    web: "bg-amber-500/10 text-amber-400",
    doc: "bg-sky-500/10 text-sky-400",
    tool: "bg-emerald-500/10 text-emerald-400",
  };
  const label: Record<DeckEntry["type"], string> = {
    slides: "Slides",
    web: "Web",
    doc: "Doc",
    tool: "Tool",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${map[type]}`}>
      {label[type]}
    </span>
  );
}

function DecksDashboard() {
  return (
    <Layout>
      <div className="space-y-6">
        <AdminNav />

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <Lock className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black">Decks &amp; Internal Materials</h1>
            <p className="text-sm text-muted-foreground">Private links to pitch decks, strategy docs, and admin tools. Locked to admin only.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DECKS.map((deck) => (
            <div
              key={deck.href}
              className="rounded-2xl border border-border/40 bg-card/50 p-5 space-y-3 hover:border-border/70 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-secondary/40 border border-border/30 flex items-center justify-center shrink-0">
                    {deck.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-snug">{deck.title}</h3>
                    <TypeBadge type={deck.type} />
                  </div>
                </div>
                {deck.badge && (
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${deck.badgeColor}`}>
                    {deck.badge}
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{deck.description}</p>

              {deck.note && (
                <p className="text-[11px] text-amber-400/70 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2 flex items-start gap-2">
                  <Zap className="w-3 h-3 mt-0.5 shrink-0" />
                  {deck.note}
                </p>
              )}

              <div>
                {deck.external ? (
                  <a href={deck.href} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-border/40">
                      Open <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                ) : (
                  <a href={deck.href}>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-border/40">
                      Open
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border/20 pt-4">
          All materials on this page are private to the admin area. Artifact URLs (pitch deck, licensing platform) require the repl to be running — share the deployed production URL when sending externally.
        </p>
      </div>
    </Layout>
  );
}

export default function AdminDecks() {
  return (
    <AdminGate
      title="Admin — Decks &amp; Materials"
      description="Enter your admin key to view pitch decks and internal documents."
    >
      <DecksDashboard />
    </AdminGate>
  );
}
