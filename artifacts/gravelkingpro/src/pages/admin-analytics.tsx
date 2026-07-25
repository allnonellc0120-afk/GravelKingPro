import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users, Eye, CreditCard, Crown, Clock, DollarSign,
  Loader2, RefreshCw, ArrowRight, AlertTriangle, BarChart3,
  TrendingUp, Wallet, AlertCircle, ExternalLink, Copy, CheckCheck,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { Link, useLocation } from "wouter";

interface Summary {
  rangeDays: number;
  totals: { pageviews: number; uniqueVisitors: number; checkoutStarts: number };
  subscriptions: {
    active: number; trialing: number; pastDue: number; total: number;
    mrr: number; recentRevenue: number; lifetimeRevenue: number; stripeOk: boolean;
  };
  conversion: { visitorToCheckoutPct: number; visitorToPaidPct: number; checkoutToPaidPct: number };
  series: Array<{ day: string; pageviews: number; visitors: number; checkoutStarts: number }>;
  topPaths: Array<{ path: string | null; count: number }>;
  topReferrers: Array<{ referrer: string | null; count: number }>;
}

const RANGES = [7, 30, 90] as const;
type AdminTab = "analytics" | "grow";

const fmt = (n: number): string => n.toLocaleString();
const money = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatCard({ icon, label, value, sub, accent }: {
  icon: ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          {icon}
          <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${accent ?? ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Dashboard (rendered only when AdminGate is unlocked) ──────────────────────

function AnalyticsDashboard() {
  const { logout } = useAdminAuth();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [copied, setCopied] = useState<string | null>(null);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscResult, setGscResult] = useState<{
    ok: boolean; siteAdded: boolean; sitemapSubmitted: boolean;
    serviceAccountEmail: string; sitesListed: string[];
    error?: string; needsAccessGrant?: boolean;
  } | null>(null);

  const copyText = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const submitToGSC = async () => {
    setGscLoading(true);
    setGscResult(null);
    try {
      const adminKey = localStorage.getItem("gk_admin_key") ?? "";
      const resp = await fetch("/api/admin/gsc-submit", {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
      });
      const data = await resp.json() as typeof gscResult;
      setGscResult(data);
    } catch {
      setGscResult({ ok: false, siteAdded: false, sitemapSubmitted: false, serviceAccountEmail: "", sitesListed: [], error: "Network error" });
    } finally {
      setGscLoading(false);
    }
  };

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/summary?days=${range}`, {
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }
      if (res.status === 503) {
        setError("Admin key is not configured on the server.");
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => { void load(days); }, [days, load]);

  const [location] = useLocation();
  const tabs = [
    { href: "/admin", label: "Analytics" },
    { href: "/admin/tracks", label: "Tracks" },
    { href: "/admin/waitlist", label: "Waitlist" },
    { href: "/admin/ops", label: "Ops" },
  ];

  const SOCIAL_POSTS = [
    {
      key: "twitter1",
      label: "Twitter/X — Feature",
      text: `🎚️ GravelKing Pro just dropped — pro-level audio mastering, music IP protection & a full live DAW in your browser.\n\nFree trial 👇\nhttps://gravelkingpro.it.com #MusicProduction #AudioMastering #IndieArtist`,
    },
    {
      key: "twitter2",
      label: "Twitter/X — IP angle",
      text: `Your music has a fingerprint. GravelKing Pro embeds a cryptographic certificate into every master — provable, verifiable, court-ready.\n\nTry it free: https://gravelkingpro.it.com #MusicIP #Copyright #BeatMaker`,
    },
    {
      key: "instagram",
      label: "Instagram caption",
      text: `Stop paying $200+ per track for mastering. GravelKing Pro gives you studio-grade masters, music IP certification, vocal booth, and a live DAW — all for less than a coffee a week. ☕🎛️\n\nLink in bio → https://gravelkingpro.it.com\n\n#GravelKing #AudioMastering #MusicProduction #IndieArtist #BeatMaker #MusicBusiness #VocalBooth #DAW #MusicIP`,
    },
    {
      key: "reddit",
      label: "Reddit post (r/WeAreTheMusicMakers)",
      text: `I built GravelKing Pro — a browser-based audio mastering + IP certification tool\n\nHey r/WeAreTheMusicMakers — I've been building GravelKing Pro for the past year and it's finally live.\n\nWhat it does:\n• MLK V3.5 mastering kernel — 6 broadcast-ready presets + full EQ/compression\n• Music IP certification with cryptographic fingerprinting\n• Live multitrack DAW in the browser\n• Vocal booth with LRC lyric sync\n\nFree trial, no install: https://gravelkingpro.it.com\n\nWould love feedback from producers!`,
    },
    {
      key: "producthunt",
      label: "Product Hunt tagline",
      text: `GravelKing Pro — Studio mastering, music IP protection & live DAW in your browser`,
    },
  ];

  const DIRECTORIES = [
    { name: "Google Search Console", url: "https://search.google.com/search-console", desc: "Submit sitemap: https://gravelkingpro.it.com/sitemap.xml", urgent: true },
    { name: "Bing Webmaster Tools", url: "https://www.bing.com/webmasters", desc: "Submit sitemap to reach Bing & DuckDuckGo traffic", urgent: true },
    { name: "Product Hunt", url: "https://www.producthunt.com/posts/new", desc: "Schedule a launch — can drive hundreds of signups in 24h", urgent: true },
    { name: "Indie Hackers", url: "https://www.indiehackers.com/product/new", desc: "Post your product and MRR story", urgent: false },
    { name: "Reddit r/WeAreTheMusicMakers", url: "https://reddit.com/r/WeAreTheMusicMakers/submit", desc: "Post a demo or show-and-tell — very active music producer community", urgent: false },
    { name: "Reddit r/makinghiphop", url: "https://reddit.com/r/makinghiphop/submit", desc: "Hip-hop producers — strong match for mastering + vocal booth", urgent: false },
    { name: "Music Ally", url: "https://musically.com/contact/", desc: "Music tech press — pitch GravelKing as an AI governance story", urgent: false },
    { name: "Hacker News Show HN", url: "https://news.ycombinator.com/submit", desc: "Title: 'Show HN: GravelKing Pro – browser-based audio mastering + IP certification'", urgent: false },
    { name: "AlternativeTo", url: "https://alternativeto.net/software/add/", desc: "List as alternative to iZotope Ozone, Bandlab Mastering, Landr", urgent: false },
    { name: "Capterra / G2", url: "https://www.capterra.com/vendors/sign-up", desc: "Music production software category", urgent: false },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        {/* Admin tab navigation */}
        <div className="flex gap-0 border-b border-border/40 flex-wrap">
          {tabs.map(t => (
            <Link key={t.href} href={t.href}>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${location === t.href ? "border-amber-500 text-amber-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            </Link>
          ))}
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "analytics" && location === "/admin" ? "border-amber-500 text-amber-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("grow")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "grow" ? "border-emerald-500 text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            🚀 Grow
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {activeTab === "grow" ? <TrendingUp className="w-6 h-6 text-emerald-500" /> : <BarChart3 className="w-6 h-6 text-amber-500" />}
              {activeTab === "grow" ? "Grow" : "Analytics"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeTab === "grow" ? "SEO checklist, social posts & submission directories" : "Traffic & conversion funnel · live revenue snapshot"}
            </p>
          </div>
          {activeTab === "analytics" && (
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border/40 overflow-hidden">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setDays(r)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      days === r ? "bg-amber-500 text-black" : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {r}d
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load(days)} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void logout()}>
                Lock
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {activeTab === "grow" && (
          <div className="space-y-6">
            {/* Google Search Console Submit */}
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <span className="text-lg">🔍</span> Submit Sitemap to Google
                    </p>
                    <p className="text-xs text-muted-foreground max-w-md">
                      Uses your GCP service account to add the site to Google Search Console and
                      submit <span className="font-mono text-foreground/70">sitemap.xml</span> in one click.
                      Since you've already verified ownership, this should go straight through.
                    </p>
                  </div>
                  <Button
                    onClick={() => void submitToGSC()}
                    disabled={gscLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-2"
                    size="sm"
                  >
                    {gscLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    {gscLoading ? "Submitting…" : "Submit to Google"}
                  </Button>
                </div>

                {gscResult && (
                  <div className={`mt-4 rounded-lg border p-4 text-sm space-y-2 ${gscResult.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
                    {gscResult.ok ? (
                      <>
                        <p className="font-semibold text-emerald-400 flex items-center gap-2">
                          <CheckCheck className="w-4 h-4" /> Sitemap submitted successfully!
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Google will start crawling your sitemap within 24–48 hours.
                          Site added: {gscResult.siteAdded ? "✓" : "already present"} ·
                          Sitemap: ✓
                        </p>
                      </>
                    ) : gscResult.needsAccessGrant ? (
                      <>
                        <p className="font-semibold text-amber-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> One manual step needed
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Go to{" "}
                          <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="underline text-foreground">
                            Google Search Console
                          </a>
                          {" "}→ Settings → Users and permissions → Add user:
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-black/30 px-2 py-1 rounded font-mono text-foreground/90 break-all">
                            {gscResult.serviceAccountEmail}
                          </code>
                          <Button variant="ghost" size="sm" className="h-6 px-1.5 shrink-0" onClick={() => copyText(gscResult!.serviceAccountEmail, "gsc-email")}>
                            {copied === "gsc-email" ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Set role to <strong>Owner</strong> or <strong>Full user</strong>, then click Submit again above.</p>
                      </>
                    ) : (
                      <p className="text-amber-300 text-xs">{gscResult.error}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SEO Checklist */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="pt-5 space-y-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">SEO Checklist — do these first</div>
                {[
                  { done: true, label: "Sitemap at /sitemap.xml", detail: "gravelkingpro.it.com/sitemap.xml ✓" },
                  { done: true, label: "robots.txt configured", detail: "Allows all public pages, blocks /admin & /api ✓" },
                  { done: true, label: "Google verification file present", detail: "google47e9ec0db824f939.html ✓" },
                  { done: true, label: '"Gravel King" added to meta keywords', detail: 'Title & description now include both "GravelKing" and "Gravel King" ✓' },
                  { done: false, label: "Submit sitemap to Google Search Console", detail: "Go to search.google.com/search-console → Sitemaps → paste https://gravelkingpro.it.com/sitemap.xml" },
                  { done: false, label: "Submit sitemap to Bing Webmaster Tools", detail: "Covers Bing + DuckDuckGo in one step" },
                  { done: false, label: "Launch on Product Hunt", detail: "Single biggest free traffic spike available — plan for a Tuesday–Thursday launch" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.done ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {item.done ? <CheckCheck className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Submission Directories */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="pt-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">Submit to these directories</div>
                <div className="space-y-2">
                  {DIRECTORIES.map((d) => (
                    <div key={d.name} className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${d.urgent ? "border-amber-500/30 bg-amber-500/5" : "border-border/30 bg-secondary/10"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{d.name}</p>
                          {d.urgent && <span className="text-[10px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded shrink-0">HIGH IMPACT</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.desc}</p>
                      </div>
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs h-7 px-2">
                          Open <ExternalLink className="w-3 h-3" />
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Social Post Templates */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="pt-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">Ready-to-post social copy</div>
                <div className="space-y-3">
                  {SOCIAL_POSTS.map((p) => (
                    <div key={p.key} className="border border-border/30 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-400">{p.label}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs text-muted-foreground"
                          onClick={() => copyText(p.text, p.key)}
                        >
                          {copied === p.key ? <><CheckCheck className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                        </Button>
                      </div>
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{p.text}</pre>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "analytics" && !data && loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {activeTab === "analytics" && data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard icon={<Users className="w-4 h-4" />} label="Visitors" value={fmt(data.totals.uniqueVisitors)} sub={`last ${data.rangeDays}d`} />
              <StatCard icon={<Eye className="w-4 h-4" />} label="Pageviews" value={fmt(data.totals.pageviews)} sub={`last ${data.rangeDays}d`} />
              <StatCard icon={<CreditCard className="w-4 h-4" />} label="Trial Starts" value={fmt(data.totals.checkoutStarts)} sub="checkout opened" />
              <StatCard icon={<Crown className="w-4 h-4 text-amber-500" />} label="Active Subs" value={fmt(data.subscriptions.active)} sub={data.subscriptions.pastDue > 0 ? `+ ${data.subscriptions.pastDue} past due` : "paying"} accent="text-amber-500" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard icon={<Clock className="w-4 h-4" />} label="Trialing" value={fmt(data.subscriptions.trialing)} sub="in free trial" />
              <StatCard icon={<DollarSign className="w-4 h-4 text-emerald-400" />} label="MRR" value={data.subscriptions.stripeOk ? money(data.subscriptions.mrr) : "—"} sub={data.subscriptions.stripeOk ? "recurring/mo" : "stripe unavailable"} accent="text-emerald-400" />
              <StatCard icon={<TrendingUp className="w-4 h-4 text-sky-400" />} label={`Revenue (${data.rangeDays}d)`} value={data.subscriptions.stripeOk ? money(data.subscriptions.recentRevenue) : "—"} sub="from Stripe charges" accent="text-sky-400" />
              <StatCard icon={<Wallet className="w-4 h-4 text-violet-400" />} label="Lifetime Revenue" value={data.subscriptions.stripeOk ? money(data.subscriptions.lifetimeRevenue) : "—"} sub="all-time charges" accent="text-violet-400" />
            </div>

            {/* Funnel */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="pt-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">Conversion funnel · {data.rangeDays}d</div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <FunnelStep label="Unique Visitors" value={fmt(data.totals.uniqueVisitors)} />
                  <FunnelArrow pct={data.conversion.visitorToCheckoutPct} />
                  <FunnelStep label="Trial Starts" value={fmt(data.totals.checkoutStarts)} />
                  <FunnelArrow pct={data.conversion.checkoutToPaidPct} />
                  <FunnelStep label="Paying" value={fmt(data.subscriptions.total)} accent="text-amber-500" />
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Visitor → paid: <span className="text-foreground font-semibold">{data.conversion.visitorToPaidPct}%</span>
                  {" · "}Paying counts current active + trialing subscriptions (all-time), not just this window.
                </p>
              </CardContent>
            </Card>

            {/* Traffic chart */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="pt-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">Traffic over time</div>
                {data.series.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No traffic recorded yet. Data will appear here as visitors arrive.
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
                          tick={{ fontSize: 11 }}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#f59e0b" strokeWidth={2} fill="url(#gVisitors)" />
                        <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="#38bdf8" strokeWidth={2} fill="url(#gViews)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top pages & referrers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TopList title="Top Pages" rows={data.topPaths.map((p) => ({ label: p.path ?? "(unknown)", count: p.count }))} />
              <TopList title="Top Referrers" rows={data.topReferrers.map((r) => ({ label: r.referrer ?? "(direct)", count: r.count }))} emptyHint="No external referrers yet — traffic is direct." />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  return (
    <AdminGate title="Admin Analytics" description="Enter your admin key to view traffic and revenue.">
      <AnalyticsDashboard />
    </AdminGate>
  );
}

function FunnelStep({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 rounded-lg bg-secondary/20 border border-border/30 px-4 py-3 text-center">
      <div className={`text-xl font-bold ${accent ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function FunnelArrow({ pct }: { pct: number }) {
  return (
    <div className="flex sm:flex-col items-center justify-center gap-1 text-muted-foreground shrink-0">
      <ArrowRight className="w-4 h-4 hidden sm:block" />
      <span className="text-xs font-semibold">{pct}%</span>
    </div>
  );
}

function TopList({ title, rows, emptyHint }: {
  title: string; rows: Array<{ label: string; count: number }>; emptyHint?: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">{title}</div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{emptyHint ?? "No data yet."}</div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="truncate text-foreground/90 max-w-[80%]">{r.label}</span>
                  <span className="text-muted-foreground tabular-nums">{r.count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                  <div className="h-full bg-amber-500/70 rounded-full" style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
