import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { AdminIntelligencePanel } from "@/components/admin-intelligence-panel";
import { AdminOperationsPanel } from "@/components/admin-operations-panel";
import { AdminAudioPanel } from "@/components/admin-audio-panel";
import { Switch } from "@/components/ui/switch";
import { publishJaxVoiceEngine } from "@/lib/jaxVoiceEngine";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save, Star, Zap } from "lucide-react";

type ControlData = {
  runtime: {
    rvc: { indexRate: number; filterRadius: number; protect: number; f0Method: string };
    jax: { voicePreset: string; temperature: number; maxOutputTokens: number };
    mastering: { defaultPreset: string };
  };
  jax: { resolvedLabel: string; pipeline: string; engine: string };
  kernel: { presets: string[] };
  providers: { sendgrid: { ok: boolean; detail?: string }; stripe: { ok: boolean; active?: number; trialing?: number; pastDue?: number; detail?: string } };
  users: Array<{ id: string; email: string | null; isPro: boolean; subscriptionTier: string | null; creditsBalance: number; createdAt: string }>;
  tracks: Array<{ id: string; title: string; artistName: string; status: string; takenDown: boolean; isFeatured: boolean; createdAt: string }>;
  storefrontBlank?: boolean;
  jaxVoiceEngineEnabled?: boolean;
  jaxStaging: Array<{ id: string; stagedAt: string; actorId: string | null; payload: Record<string, unknown> }>;
};

const CONTRACT_ADMIN_IDENTITY = "allnonellc0120@gmail.com";

function ControlDashboard() {
  const { logout } = useAdminAuth();
  const [data, setData] = useState<ControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rvc, setRvc] = useState({ indexRate: 0.75, filterRadius: 3, protect: 0.38, f0Method: "rmvpe" });
  const [jax, setJax] = useState({ voicePreset: "", temperature: 0.7, maxOutputTokens: 1024 });
  const [defaultPreset, setDefaultPreset] = useState("baseline");
  const [storefrontBlank, setStorefrontBlank] = useState(false);
  const [jaxVoiceEnabled, setJaxVoiceEnabled] = useState(false);
  const [jaxVoiceSaving, setJaxVoiceSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/control", {
        credentials: "include",
        cache: "no-store",
        headers: { "x-admin-user": CONTRACT_ADMIN_IDENTITY },
      });
      if (res.status === 401 || res.status === 403) { logout(); return; }
      const json = await res.json() as ControlData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load controls");
      setData(json); setRvc(json.runtime.rvc); setJax(json.runtime.jax); setDefaultPreset(json.runtime.mastering.defaultPreset); setStorefrontBlank(json.storefrontBlank === true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load controls"); }
    finally { setLoading(false); }
  }, [logout]);
  useEffect(() => {
    let cancelled = false;
    const forceVoiceOff = async () => {
      try {
        await fetch("/api/admin/control/jax-voice", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
          body: JSON.stringify({ enabled: false }),
        });
      } finally {
        if (!cancelled) {
          setJaxVoiceEnabled(false);
          publishJaxVoiceEngine(false);
          void load();
        }
      }
    };
    void forceVoiceOff();
    return () => { cancelled = true; };
  }, [load]);

  const save = async () => {
    setSaving(true); setMessage(null); setError(null);
    try {
      const res = await fetch("/api/admin/control/runtime", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
        body: JSON.stringify({ rvc, jax, mastering: { defaultPreset } }),
      });
      const json = await res.json() as { runtime?: ControlData["runtime"]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (json.runtime) { setRvc(json.runtime.rvc); setJax(json.runtime.jax); setDefaultPreset(json.runtime.mastering.defaultPreset); }
      setMessage("Runtime controls saved. New generations use these defaults.");
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const changeTier = async (id: string, tier: string) => {
    const res = await fetch(`/api/admin/control/users/${id}/entitlement`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
        body: JSON.stringify({ tier }),
    });
    if (!res.ok) { setError("Could not update entitlement"); return; }
    await load();
  };

  const feature = async (id: string, featured: boolean) => {
    const res = await fetch(`/api/admin/control/tracks/${id}/featured`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
      body: JSON.stringify({ featured }),
    });
    if (!res.ok) { setError("Could not update featured state"); return; }
    await load();
  };

  const toggleStorefront = async () => {
    const res = await fetch("/api/admin/control/storefront", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
      body: JSON.stringify({ storefrontBlank: !storefrontBlank }),
    });
    if (!res.ok) { setError("Could not update storefront visibility"); return; }
    setStorefrontBlank(!storefrontBlank);
    setMessage(!storefrontBlank ? "Storefront blank mode enabled." : "Storefront releases restored.");
  };

  const toggleJaxVoice = async (enabled: boolean) => {
    setJaxVoiceSaving(true);
    setError(null);
    try {
      const controlResponse = await fetch("/api/admin/control/jax-voice", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
        body: JSON.stringify({ enabled }),
      });
      const controlResult = await controlResponse.json().catch(() => ({})) as { enabled?: boolean; error?: string };
      if (!controlResponse.ok || controlResult.enabled !== enabled) {
        throw new Error(controlResult.error ?? "Could not change the JAX Voice Engine state.");
      }
      if (enabled) {
        const warmup = await fetch("/api/admin/jax/tts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "JAX voice engine warmup." }),
        });
        if (!warmup.ok) {
          const result = await warmup.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error ?? "JAX voice warmup failed.");
        }
      }
      setJaxVoiceEnabled(enabled);
      publishJaxVoiceEngine(enabled);
      setMessage(enabled ? "JAX Voice Engine enabled after warmup." : "JAX Voice Engine disabled. No new audio requests will run.");
    } catch (e) {
      if (enabled) {
        await fetch("/api/admin/control/jax-voice", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-admin-user": CONTRACT_ADMIN_IDENTITY },
          body: JSON.stringify({ enabled: false }),
        }).catch(() => {});
      }
      setJaxVoiceEnabled(false);
      publishJaxVoiceEngine(false);
      setError(e instanceof Error ? e.message : "Could not change the JAX Voice Engine state.");
    } finally {
      setJaxVoiceSaving(false);
    }
  };

  const clearJaxStaging = async () => {
    const response = await fetch("/api/admin/control/jax-staging", {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setError("Could not clear the JAX staging box");
      return;
    }
    await load();
    setMessage("JAX JSON staging box cleared.");
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <AdminNav />
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-amber-500" /> Admin Control Surface</h1><p className="text-sm text-muted-foreground mt-1">Entitlements, outreach providers, live payments, kernel defaults, and label controls.</p></div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button><Button variant="ghost" size="sm" onClick={() => void logout()}>Lock</Button></div>
        </div>
        {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
        {message && <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2 flex gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}
        {loading && !data ? <div className="py-24 flex justify-center"><Loader2 className="animate-spin" /></div> : data && <>
          <div className="grid md:grid-cols-3 gap-3">
            <Card><CardContent className="pt-5"><p className="text-xs uppercase text-muted-foreground">SendGrid outreach</p><Badge className="mt-3" variant="outline">{data.providers.sendgrid.ok ? "Connected" : data.providers.sendgrid.detail ?? "Unavailable"}</Badge><p className="text-xs text-muted-foreground mt-2">Bulk sends remain confirmation-gated in Emails.</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-xs uppercase text-muted-foreground">Stripe monitor</p><p className="text-2xl font-bold mt-2">{data.providers.stripe.ok ? data.providers.stripe.active : "—"}</p><p className="text-xs text-muted-foreground">active · {data.providers.stripe.trialing ?? 0} trialing · {data.providers.stripe.pastDue ?? 0} past due</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-xs uppercase text-muted-foreground">MLK / JAX</p><p className="text-sm font-semibold mt-2">{data.jax.resolvedLabel}</p><p className="text-xs text-muted-foreground">{data.jax.engine} · {data.jax.pipeline}</p></CardContent></Card>
          </div>
          <Card><CardContent className="pt-5 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Generation defaults</h2><p className="text-xs text-muted-foreground">Validated server-side and applied to future RVC generations and mastering requests without an explicit preset.</p></div><Button onClick={() => void save()} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}Save</Button></div>
            <div className="grid md:grid-cols-4 gap-3"><label className="text-xs text-muted-foreground">RVC index rate<input type="number" min="0" max="1" step="0.01" value={rvc.indexRate} onChange={e => setRvc({ ...rvc, indexRate: Number(e.target.value) })} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm" /></label><label className="text-xs text-muted-foreground">Filter radius<input type="number" min="0" max="7" step="1" value={rvc.filterRadius} onChange={e => setRvc({ ...rvc, filterRadius: Number(e.target.value) })} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm" /></label><label className="text-xs text-muted-foreground">Protect<input type="number" min="0" max="1" step="0.01" value={rvc.protect} onChange={e => setRvc({ ...rvc, protect: Number(e.target.value) })} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm" /></label><label className="text-xs text-muted-foreground">F0 method<select value={rvc.f0Method} onChange={e => setRvc({ ...rvc, f0Method: e.target.value })} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm"><option value="rmvpe">rmvpe</option><option value="harvest">harvest</option><option value="pm">pm</option></select></label></div>
            <div className="grid md:grid-cols-3 gap-3"><label className="text-xs text-muted-foreground">JAX temperature<input type="number" min="0" max="2" step="0.05" value={jax.temperature} onChange={e => setJax({ ...jax, temperature: Number(e.target.value) })} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm" /></label><label className="text-xs text-muted-foreground">JAX max output tokens<input type="number" min="64" max="8192" step="64" value={jax.maxOutputTokens} onChange={e => setJax({ ...jax, maxOutputTokens: Number(e.target.value) })} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm" /></label><label className="text-xs text-muted-foreground">Default mastering preset<select value={defaultPreset} onChange={e => setDefaultPreset(e.target.value)} className="mt-1 w-full bg-secondary/40 border rounded px-2 py-2 text-sm">{data.kernel.presets.map(p => <option key={p}>{p}</option>)}</select></label></div>
          </CardContent></Card>
           <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
             <div>
               <h2 className="font-semibold">JAX Voice Engine</h2>
               <p className="mt-1 max-w-2xl text-xs text-muted-foreground">OFF by default on every cold start and Admin Control reload. Turning it ON runs one explicit warmup request before the floating JAX copilot can request or play audio.</p>
               <p className={`mt-2 text-xs font-medium ${jaxVoiceEnabled ? "text-emerald-400" : "text-zinc-500"}`}>{jaxVoiceEnabled ? "ON · voice requests enabled" : "OFF · text-only mode · zero voice compute"}</p>
             </div>
             <div className="flex items-center gap-3">
               <span className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">{jaxVoiceEnabled ? "ON" : "OFF"}</span>
               <Switch checked={jaxVoiceEnabled} disabled={jaxVoiceSaving} onCheckedChange={value => void toggleJaxVoice(value)} aria-label="JAX Voice Engine" />
             </div>
           </CardContent></Card>
          <Card><CardContent className="pt-5"><h2 className="font-semibold mb-3">User entitlements</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Tier</th><th className="py-2 pr-3">Credits</th><th className="py-2">Change</th></tr></thead><tbody>{data.users.slice(0, 30).map(u => <tr key={u.id} className="border-b border-border/20"><td className="py-2 pr-3">{u.email ?? "anonymous"}</td><td className="py-2 pr-3">{u.subscriptionTier ?? "free"}</td><td className="py-2 pr-3">{u.creditsBalance}</td><td className="py-2"><select value={u.subscriptionTier ?? "free"} onChange={e => void changeTier(u.id, e.target.value)} className="bg-secondary/40 border rounded px-2 py-1 text-xs"><option value="free">free</option><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="node_auditor">node_auditor</option></select></td></tr>)}</tbody></table></div></CardContent></Card>
          <Card><CardContent className="pt-5"><h2 className="font-semibold mb-3">Label featuring</h2><div className="space-y-2">{data.tracks.map(t => <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/20 py-2"><div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.artistName} · {t.status}{t.takenDown ? " · taken down" : ""}</p></div><Button size="sm" variant={t.isFeatured ? "default" : "outline"} disabled={t.takenDown} onClick={() => void feature(t.id, !t.isFeatured)} className="gap-1">{t.isFeatured ? <><Star className="w-3 h-3 fill-current" />Featured</> : <><Star className="w-3 h-3" />Feature</>}</Button></div>)}</div></CardContent></Card>
           <Card><CardContent className="pt-5 space-y-3"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Storefront visibility</h2><p className="text-xs text-muted-foreground">Keep the public label page clean between featured artist releases.</p></div><Button size="sm" variant={storefrontBlank ? "default" : "outline"} onClick={() => void toggleStorefront()}>{storefrontBlank ? "Restore storefront" : "Blank storefront"}</Button></div><p className="text-xs text-muted-foreground">Current state: {storefrontBlank ? "blank when no active featured artist" : "releases visible"}</p></CardContent></Card>
           <AdminAudioPanel />
           <AdminOperationsPanel />
           <AdminIntelligencePanel />
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">JAX JSON staging box</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Owner-reviewed proposals from the floating copilot. Nothing here executes automatically.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void clearJaxStaging()} disabled={!data.jaxStaging.length}>Clear box</Button>
                </div>
                {data.jaxStaging.length ? <div className="space-y-3">{data.jaxStaging.map(item => (
                  <details key={item.id} className="rounded-lg border border-amber-400/20 bg-black/20 p-3">
                    <summary className="cursor-pointer text-xs text-amber-200">{new Date(item.stagedAt).toLocaleString()} · {item.id.slice(0, 8)}</summary>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-[11px] text-zinc-300">{JSON.stringify(item.payload, null, 2)}</pre>
                  </details>
                ))}</div> : <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-muted-foreground">No staged JSON proposals.</p>}
              </CardContent>
            </Card>
        </>}
      </div>
    </Layout>
  );
}

export default function AdminControl() {
  return <AdminGate ownerOnly title="Admin Control Surface"><ControlDashboard /></AdminGate>;
}