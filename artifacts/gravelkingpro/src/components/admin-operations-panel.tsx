import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Funnel = {
  generatedAt: string;
  methodology: string;
  stages: { name: string; reached: number; dropoff: number | null }[];
  active: { sessions: number; devices: Record<string, number> };
  errors: { stage: string; sourceStage: string; tool: string; count: number }[];
};
type Account = { id: string; email: string | null; name: string | null; creditsBalance: number; tier: string | null; status: string };
type Ledger = { delta: number; kind: string; reference: string | null; createdAt: string };
type Audit = { action: string; reason: string; at: string; actorId: string; amount?: number; tier?: string };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/operations${path}`, {
    ...options, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", "x-admin-user": "allnonellc0120@gmail.com", ...options?.headers },
  });
  const body = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export function AdminOperationsPanel() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [tier, setTier] = useState("studio");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setError(null); setFunnel(await api<Funnel>("/funnel")); }
    catch (err) { setError(err instanceof Error ? err.message : "Funnel unavailable"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const search = async (term = query) => {
    try {
      setError(null);
      const result = await api<{ users: Account[] }>(`/accounts?q=${encodeURIComponent(term)}`);
      setUsers(result.users);
      if (selected) {
        const updated = result.users.find(u => u.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Search failed"); }
  };
  const choose = async (account: Account) => {
    try {
      setError(null);
      const result = await api<{ entries: Ledger[]; audit: Audit[] }>(`/accounts/${encodeURIComponent(account.id)}/ledger`);
      setSelected(account);
      setLedger(result.entries);
      setAudit(result.audit);
    } catch (err) { setError(err instanceof Error ? err.message : "Ledger unavailable"); }
  };
  const override = async (action: string) => {
    if (!selected) return;
    if (!window.confirm(`Confirm ${action} for ${selected.email ?? selected.id}? Content will not be deleted.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await api(`/accounts/${encodeURIComponent(selected.id)}/override`, {
        method: "POST",
        body: JSON.stringify({ action, reason, ...(action === "tier" ? { tier } : {}), ...(["add", "deduct", "set"].includes(action) ? { amount: Number(amount) } : {}) }),
      });
      setNotice(`${action} saved and audited.`);
      await search();
      const result = await api<{ entries: Ledger[]; audit: Audit[] }>(`/accounts/${encodeURIComponent(selected.id)}/ledger`);
      setLedger(result.entries);
      setAudit(result.audit);
    } catch (err) { setError(err instanceof Error ? err.message : "Override failed"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <Card><CardContent className="pt-5 space-y-3">
      <div className="flex justify-between gap-3"><div><h2 className="font-semibold">Live funnel</h2><p className="text-xs text-muted-foreground">Last 7 days · {funnel?.generatedAt ? new Date(funnel.generatedAt).toLocaleString() : "Loading"}</p></div><Button variant="outline" onClick={() => void refresh()}>Instant Refresh</Button></div>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {funnel && <><p className="text-xs text-muted-foreground">{funnel.methodology}</p><div className="grid gap-2 md:grid-cols-3">{funnel.stages.map(s => <div key={s.name} className="border rounded p-3"><p className="text-sm font-semibold">{s.name}</p><p>{s.reached} visitors</p><p className="text-xs text-muted-foreground">{s.dropoff === null ? "Terminal stage" : `${s.dropoff} did not visit next stage`}</p></div>)}</div>
      <p className="text-sm">Active (last 15 minutes): <strong>{funnel.active.sessions}</strong> · {Object.entries(funnel.active.devices).map(([name, count]) => `${name}: ${count}`).join(" · ")}</p>
      <div><h3 className="font-medium">Pipeline errors</h3>{funnel.errors.length ? funnel.errors.map(e => <p key={`${e.stage}:${e.sourceStage}:${e.tool}`} className="text-xs">{e.stage} · {e.tool} / {e.sourceStage}: {e.count}</p>) : <p className="text-xs text-muted-foreground">No recorded tool errors in this window.</p>}</div></>}
    </CardContent></Card>
    <Card><CardContent className="pt-5 space-y-3"><h2 className="font-semibold">Accounts & credit ledger</h2>
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="flex gap-2"><input aria-label="Search email, artist handle or ID" placeholder="Email, artist handle or exact ID" value={query} onChange={e => setQuery(e.target.value)} className="bg-secondary/40 border rounded px-2 py-2 flex-1" /><Button type="submit">Search</Button></form>
      {users.map(u => <button key={u.id} type="button" onClick={() => void choose(u)} className="block text-left w-full border rounded p-2 text-sm">{u.email ?? "No email"} · {u.name || "No handle"} · {u.id} · {u.creditsBalance} credits · {u.tier ?? "free"} · {u.status}</button>)}
      {selected && <div className="border rounded p-3 space-y-3">
        <p className="font-semibold">{selected.email ?? selected.id} · {selected.creditsBalance} wallet credits</p><p className="text-xs text-muted-foreground">MP3 and WAV exports spend from the same wallet (50 / 100 credits); no separate balances exist. Freeze/ban blocks requests at the auth boundary. Reset restores account access without deleting content or changing credits.</p>
        <label className="block text-sm">Audit reason (required)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} className="block w-full bg-secondary/40 border rounded px-2 py-2" /></label>
        <label className="block text-sm">Credits<input type="number" min="0" max="1000000" step="1" value={amount} onChange={e => setAmount(e.target.value)} className="block bg-secondary/40 border rounded px-2 py-2" /></label>
        <div className="flex flex-wrap gap-2">{["add", "deduct", "set"].map(a => <Button key={a} variant="outline" disabled={busy || reason.trim().length < 8 || !amount} onClick={() => void override(a)}>{a} credits</Button>)}</div>
        <div className="flex flex-wrap gap-2"><select aria-label="Override tier" value={tier} onChange={e => setTier(e.target.value)} className="bg-secondary/40 border rounded px-2"><option value="studio">Studio Pass</option><option value="owner">Owner</option><option value="vip">VIP bypass</option></select><Button variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => void override("tier")}>Apply tier</Button></div>
        <div className="flex flex-wrap gap-2">{["freeze", "ban", "unfreeze", "reset"].map(a => <Button key={a} variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => void override(a)}>{a}</Button>)}</div>
        {notice && <p role="status" className="text-green-400">{notice}</p>}
        <h3 className="font-semibold">Recent wallet entries</h3>{ledger.map((entry, i) => <p key={`${entry.reference}:${i}`} className="text-xs">{new Date(entry.createdAt).toLocaleString()} · {entry.kind} · {entry.delta > 0 ? "+" : ""}{entry.delta} · {entry.reference}</p>)}
        <h3 className="font-semibold">Override audit</h3>{audit.map((entry, i) => <p key={`${entry.at}:${i}`} className="text-xs">{new Date(entry.at).toLocaleString()} · {entry.action} {entry.amount ?? entry.tier ?? ""} · {entry.reason} · by {entry.actorId}</p>)}
      </div>}
    </CardContent></Card>
  </div>;
}