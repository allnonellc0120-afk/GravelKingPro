import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users, Eye, CreditCard, Crown, Clock, DollarSign,
  Loader2, RefreshCw, ArrowRight, AlertTriangle, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";

interface Summary {
  rangeDays: number;
  totals: { pageviews: number; uniqueVisitors: number; checkoutStarts: number };
  subscriptions: { active: number; trialing: number; total: number; mrr: number; stripeOk: boolean };
  conversion: { visitorToCheckoutPct: number; visitorToPaidPct: number; checkoutToPaidPct: number };
  series: Array<{ day: string; pageviews: number; visitors: number; checkoutStarts: number }>;
  topPaths: Array<{ path: string | null; count: number }>;
  topReferrers: Array<{ referrer: string | null; count: number }>;
}

const RANGES = [7, 30, 90] as const;

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

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-amber-500" />
              Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Traffic & conversion funnel · live revenue snapshot</p>
          </div>
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
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!data && loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={<Users className="w-4 h-4" />} label="Visitors" value={fmt(data.totals.uniqueVisitors)} sub={`last ${data.rangeDays}d`} />
              <StatCard icon={<Eye className="w-4 h-4" />} label="Pageviews" value={fmt(data.totals.pageviews)} sub={`last ${data.rangeDays}d`} />
              <StatCard icon={<CreditCard className="w-4 h-4" />} label="Trial Starts" value={fmt(data.totals.checkoutStarts)} sub="checkout opened" />
              <StatCard icon={<Crown className="w-4 h-4 text-amber-500" />} label="Active" value={fmt(data.subscriptions.active)} sub="paying subs" accent="text-amber-500" />
              <StatCard icon={<Clock className="w-4 h-4" />} label="Trialing" value={fmt(data.subscriptions.trialing)} sub="in trial" />
              <StatCard icon={<DollarSign className="w-4 h-4 text-emerald-400" />} label="MRR" value={data.subscriptions.stripeOk ? money(data.subscriptions.mrr) : "—"} sub={data.subscriptions.stripeOk ? "normalized" : "stripe unavailable"} accent="text-emerald-400" />
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
