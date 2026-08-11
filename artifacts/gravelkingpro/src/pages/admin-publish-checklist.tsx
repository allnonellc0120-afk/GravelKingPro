/**
 * Admin Publish Checklist — pre-publish verification for production readiness.
 * Confirms Stripe config, Play Billing, analytics, UTM flow, and key routes
 * before the user clicks Publish.
 */
import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCheck, AlertCircle, Loader2, RefreshCw, ExternalLink,
  CreditCard, Smartphone, BarChart3, Shield, Globe, Zap,
} from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";

interface CheckResult {
  key: string;
  label: string;
  detail?: string;
  status: "pass" | "fail" | "warn" | "pending";
}

interface ChecklistData {
  stripe: {
    connected: boolean;
    productsSeeded: boolean;
    webhookConfigured: boolean;
    planCount: number;
  };
  analytics: {
    tableReachable: boolean;
    recentEvents: number;
  };
  domain: {
    customDomainSet: boolean;
    domainValue: string;
  };
}

function StatusIcon({ status }: { status: CheckResult["status"] }) {
  if (status === "pass") return <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (status === "fail") return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (status === "warn") return <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />;
  return <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />;
}

function CheckRow({ check }: { check: CheckResult }) {
  const bg =
    check.status === "pass" ? "border-emerald-500/20 bg-emerald-500/5"
    : check.status === "fail" ? "border-red-500/20 bg-red-500/5"
    : check.status === "warn" ? "border-amber-500/20 bg-amber-500/5"
    : "border-border/30 bg-secondary/5";

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${bg}`}>
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${check.status === "fail" ? "text-red-300" : check.status === "warn" ? "text-amber-300" : check.status === "pass" ? "text-foreground" : "text-muted-foreground"}`}>
          {check.label}
        </p>
        {check.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
        )}
      </div>
    </div>
  );
}

function CheckSection({
  icon, title, checks,
}: {
  icon: React.ReactNode; title: string; checks: CheckResult[];
}) {
  const passing = checks.filter((c) => c.status === "pass").length;
  const failing = checks.filter((c) => c.status === "fail").length;
  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${failing > 0 ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
            {passing}/{checks.length} pass
          </span>
        </div>
        <div className="space-y-2">
          {checks.map((c) => <CheckRow key={c.key} check={c} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Manual checklist items (can't be auto-verified) ──────────────────────────

const MANUAL_ITEMS = [
  {
    section: "Stripe live mode",
    items: [
      "Stripe is in LIVE mode (not test mode) in the Replit integration dashboard",
      "The managed webhook is active — check the Stripe dashboard → Developers → Webhooks",
      "seed-products.ts was run against the live Stripe account (not test mode products)",
      "The billing portal is enabled: Stripe dashboard → Settings → Billing Portal",
    ],
  },
  {
    section: "Google Play",
    items: [
      "Play Billing products are published in the Play Console (not draft)",
      "The TWA assetlinks.json points to the current deployed domain",
      "The Play reviewer demo account credentials are verified at /demo-login",
      "In-app purchases are enabled for the Play app (not just APK upload)",
    ],
  },
  {
    section: "Funnel readiness",
    items: [
      "Visited /pricing?plan=monthly as a signed-out user — redirected to sign-in, then back to pricing with plan pre-selected",
      "Completed a test checkout in Stripe (use a test card, then switch to live mode)",
      "Trial badge shows '7-day free trial' on the Studio card for a new account",
      "After checkout cancel, no toast says 'trial consumed' — trial stays available",
      "Admin analytics at /admin shows conversion funnel data (may be zeros until first visit)",
      "Appended ?utm_source=youtube to the homepage URL — source appears in Admin → UTM Sources after any pageview",
    ],
  },
  {
    section: "SEO & discovery",
    items: [
      "Sitemap submitted to Google Search Console via Admin → Grow",
      "Sitemap submitted to Bing Webmaster Tools via Admin → Grow",
      "Open Graph image present at /opengraph.jpg (used by Twitter/X, LinkedIn shares)",
    ],
  },
  {
    section: "Before clicking Publish",
    items: [
      "Run: rm -rf .cache/uv .cache/torch .cache/pip ~/.cache/audio-separator (keeps image under 8 GiB)",
      "Run: pnpm install (materializes all node_modules for Expo bundling)",
      "Raw STRIPE_SECRET_KEY secret deleted from Replit Secrets (blocks publish if present)",
    ],
  },
];

// ── Auto-verifiable checks ────────────────────────────────────────────────────

async function runChecks(): Promise<ChecklistData> {
  const [productsRes, analyticsRes] = await Promise.allSettled([
    fetch("/api/stripe/products", { credentials: "include" }).then((r) => r.json()) as Promise<{ data?: unknown[]; warning?: string }>,
    fetch("/api/analytics/summary?days=7", { credentials: "include" }).then((r) => r.json()) as Promise<{ totals?: { pageviews: number }; conversion?: unknown }>,
  ]);

  const products = productsRes.status === "fulfilled" ? productsRes.value : null;
  const analytics = analyticsRes.status === "fulfilled" ? analyticsRes.value : null;

  const planCount = Array.isArray(products?.data) ? (products.data as unknown[]).length : 0;
  const hasWarning = Boolean(products?.warning);

  return {
    stripe: {
      connected: products !== null && !("error" in (products ?? {})),
      productsSeeded: planCount > 0 && !hasWarning,
      webhookConfigured: products !== null, // can't verify directly; approximate
      planCount,
    },
    analytics: {
      tableReachable: analytics !== null && "totals" in (analytics ?? {}),
      recentEvents: (analytics as { totals?: { pageviews?: number } })?.totals?.pageviews ?? 0,
    },
    domain: {
      customDomainSet: window.location.hostname.includes("gravelkingpro"),
      domainValue: window.location.hostname,
    },
  };
}

// ── Dashboard component ───────────────────────────────────────────────────────

function ChecklistDashboard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChecklistData | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      setData(await runChecks());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(); }, [run]);

  const stripeChecks: CheckResult[] = data ? [
    {
      key: "stripe-connected",
      label: "Stripe integration connected",
      detail: data.stripe.connected ? "API responded successfully" : "Stripe returned an error or is not connected",
      status: data.stripe.connected ? "pass" : "fail",
    },
    {
      key: "stripe-products",
      label: `Products seeded (${data.stripe.planCount} found)`,
      detail: data.stripe.productsSeeded
        ? "Weekly, Studio, and Node Auditor products exist in Stripe"
        : "Run: pnpm --filter @workspace/scripts run seed-products",
      status: data.stripe.productsSeeded ? "pass" : "fail",
    },
    {
      key: "stripe-webhook",
      label: "Webhook endpoint configured",
      detail: "Verify in Stripe dashboard → Developers → Webhooks that the managed webhook is active",
      status: data.stripe.connected ? "warn" : "fail",
    },
  ] : [
    { key: "stripe-connected", label: "Stripe integration connected", status: "pending" },
    { key: "stripe-products", label: "Products seeded", status: "pending" },
    { key: "stripe-webhook", label: "Webhook endpoint configured", status: "pending" },
  ];

  const analyticsChecks: CheckResult[] = data ? [
    {
      key: "analytics-table",
      label: "Analytics database reachable",
      detail: data.analytics.tableReachable ? "analytics_events table returned data" : "Admin summary endpoint failed — check DB connection",
      status: data.analytics.tableReachable ? "pass" : "fail",
    },
    {
      key: "analytics-events",
      label: `Recent pageviews recorded (${data.analytics.recentEvents} in 7d)`,
      detail: data.analytics.recentEvents > 0
        ? "Funnel tracking is active"
        : "No events recorded yet — normal for a fresh deploy; send a test pageview",
      status: data.analytics.recentEvents > 0 ? "pass" : "warn",
    },
  ] : [
    { key: "analytics-table", label: "Analytics database reachable", status: "pending" },
    { key: "analytics-events", label: "Recent pageviews recorded", status: "pending" },
  ];

  const domainChecks: CheckResult[] = data ? [
    {
      key: "custom-domain",
      label: `Custom domain active (${data.domain.domainValue})`,
      detail: data.domain.customDomainSet
        ? "Serving from gravelkingpro.it.com — assetlinks.json will resolve correctly"
        : "Not on the custom domain — TWA assetlinks.json and Play billing may not work",
      status: data.domain.customDomainSet ? "pass" : "warn",
    },
  ] : [
    { key: "custom-domain", label: "Custom domain active", status: "pending" },
  ];

  const allAutoChecks = [...stripeChecks, ...analyticsChecks, ...domainChecks];
  const failCount = allAutoChecks.filter((c) => c.status === "fail").length;
  const warnCount = allAutoChecks.filter((c) => c.status === "warn").length;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 space-y-6">
        <AdminNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-amber-500" />
              Publish Checklist
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Verify every system before clicking Publish in the Replit deployment panel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <span className={`text-xs font-medium px-3 py-1 rounded-full border ${
                failCount > 0 ? "border-red-500/30 bg-red-500/10 text-red-400"
                : warnCount > 0 ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              }`}>
                {failCount > 0 ? `${failCount} issue${failCount > 1 ? "s" : ""} to fix`
                : warnCount > 0 ? `${warnCount} item${warnCount > 1 ? "s" : ""} to verify manually`
                : "Auto-checks passing"}
              </span>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void run()} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-run checks
            </Button>
          </div>
        </div>

        {/* Auto checks */}
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Automated checks</p>
          <CheckSection
            icon={<CreditCard className="w-4 h-4 text-emerald-400" />}
            title="Stripe Payments"
            checks={stripeChecks}
          />
          <CheckSection
            icon={<BarChart3 className="w-4 h-4 text-amber-400" />}
            title="Analytics"
            checks={analyticsChecks}
          />
          <CheckSection
            icon={<Globe className="w-4 h-4 text-sky-400" />}
            title="Domain &amp; Infrastructure"
            checks={domainChecks}
          />
        </div>

        {/* Manual checklist */}
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manual verification — check each before publishing</p>
          {MANUAL_ITEMS.map((section) => (
            <Card key={section.section} className="border-border/40 bg-card/40">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  {section.section.includes("Stripe") ? <CreditCard className="w-4 h-4 text-emerald-400" />
                    : section.section.includes("Play") ? <Smartphone className="w-4 h-4 text-sky-400" />
                    : section.section.includes("Funnel") ? <Zap className="w-4 h-4 text-amber-400" />
                    : section.section.includes("SEO") ? <Globe className="w-4 h-4 text-violet-400" />
                    : <Shield className="w-4 h-4 text-red-400" />}
                  <span className="text-sm font-semibold">{section.section}</span>
                </div>
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-4 h-4 rounded border border-border/50 shrink-0 mt-0.5 inline-block" />
                      {item.startsWith("Run:") ? (
                        <span>
                          {item.split("Run:")[0]}Run:{" "}
                          <code className="font-mono text-xs bg-black/30 border border-border/30 rounded px-1.5 py-0.5 text-foreground/80 select-all">
                            {item.split("Run:")[1].trim()}
                          </code>
                        </span>
                      ) : item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick links */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Quick links</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Stripe Dashboard", href: "https://dashboard.stripe.com" },
                { label: "Play Console", href: "https://play.google.com/console" },
                { label: "Admin Analytics", href: "/admin" },
                { label: "Admin Grow", href: "/admin" },
                { label: "Pricing Page", href: "/pricing" },
                { label: "Demo Login", href: "/demo-login" },
              ].map((link) => (
                <a key={link.label} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                    {link.label}
                    {link.href.startsWith("http") && <ExternalLink className="w-3 h-3" />}
                  </Button>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

export default function AdminPublishChecklist() {
  return (
    <AdminGate title="Publish Checklist" description="Enter your admin key to view the publish checklist.">
      <ChecklistDashboard />
    </AdminGate>
  );
}
