import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";

interface PromoterRow {
  id: string;
  userId: string;
  code: string;
  displayName: string | null;
  payoutDetails: string | null;
  status: "pending" | "approved" | "rejected";
  commissionRate: number;
  createdAt: string;
  clicks: number;
  conversions: number;
  pendingCents: number;
  paidCents: number;
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function PromotersDashboard() {
  const [rows, setRows] = useState<PromoterRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promoters", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { promoters: PromoterRow[] };
      setRows(json.promoters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setStatus = useCallback(
    async (id: string, status: string) => {
      setBusy(id);
      try {
        await fetch(`/api/admin/promoters/${id}/status`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const markPaid = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await fetch(`/api/admin/promoters/${id}/mark-paid`, {
          method: "POST",
          credentials: "include",
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Promoters</h1>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No promoters registered yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="font-semibold">{p.displayName || "(no name)"}</span>{" "}
                    <span className="font-mono text-sm text-muted-foreground">{p.code}</span>
                  </div>
                  <span
                    className={
                      p.status === "approved"
                        ? "text-green-500 text-sm"
                        : p.status === "rejected"
                          ? "text-destructive text-sm"
                          : "text-yellow-500 text-sm"
                    }
                  >
                    {p.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Clicks:</span> {p.clicks}</div>
                  <div><span className="text-muted-foreground">Conversions:</span> {p.conversions}</div>
                  <div><span className="text-muted-foreground">Rate:</span> {p.commissionRate}%</div>
                  <div><span className="text-muted-foreground">Pending:</span> {usd(p.pendingCents)}</div>
                  <div><span className="text-muted-foreground">Paid:</span> {usd(p.paidCents)}</div>
                </div>
                {p.payoutDetails && (
                  <div className="text-xs text-muted-foreground">Payout: {p.payoutDetails}</div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {p.status !== "approved" && (
                    <Button size="sm" onClick={() => setStatus(p.id, "approved")} disabled={busy === p.id}>
                      Approve
                    </Button>
                  )}
                  {p.status !== "rejected" && (
                    <Button size="sm" variant="destructive" onClick={() => setStatus(p.id, "rejected")} disabled={busy === p.id}>
                      Reject
                    </Button>
                  )}
                  {p.pendingCents > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (window.confirm(`Mark ${usd(p.pendingCents)} in pending commissions as paid out?`)) {
                          void markPaid(p.id);
                        }
                      }}
                      disabled={busy === p.id}
                    >
                      Mark {usd(p.pendingCents)} paid
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPromotersPage() {
  return (
    <Layout>
      <AdminGate title="Promoters Admin">
        <AdminNav>
          <PromotersDashboard />
        </AdminNav>
      </AdminGate>
    </Layout>
  );
}
