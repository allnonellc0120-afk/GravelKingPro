import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";

interface OrderSlot {
  slot: number;
  name: string | null;
  uploaded: boolean;
}

interface Order {
  id: string;
  created: number;
  customerEmail: string | null;
  amountTotal: number | null;
  status: string;
  submittedAt: string | null;
  deliveredAt: string | null;
  tracks: OrderSlot[];
  masters: OrderSlot[];
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  awaiting_uploads: { label: "Awaiting uploads", cls: "border-zinc-500/40 text-zinc-400" },
  files_submitted: { label: "Ready to master", cls: "border-amber-500/40 text-amber-400" },
  delivered: { label: "Delivered", cls: "border-emerald-500/40 text-emerald-400" },
};

function fmtTs(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OrderCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliverResult, setDeliverResult] = useState<string | null>(null);

  const downloadSource = async (slot: number) => {
    setBusy(`src-${slot}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/weekend-special/admin/orders/${order.id}/source/${slot}`,
        { credentials: "include" },
      );
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Download failed");
      window.location.assign(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const uploadMaster = async (slot: number, file: File) => {
    setBusy(`master-${slot}`);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/weekend-special/admin/orders/${order.id}/master/${slot}`,
        { method: "POST", body: formData, credentials: "include" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const deliver = async () => {
    setBusy("deliver");
    setError(null);
    setDeliverResult(null);
    try {
      const res = await fetch(`/api/weekend-special/admin/orders/${order.id}/deliver`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { emailed?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delivery failed");
      setDeliverResult(
        json.emailed
          ? "Delivered — the customer was emailed their download link."
          : "Marked delivered, but the email could not be sent. Send the link manually.",
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delivery failed");
    } finally {
      setBusy(null);
    }
  };

  const status = STATUS_LABEL[order.status] ?? STATUS_LABEL.awaiting_uploads;
  const allMastersUp = order.masters.every((m) => m.uploaded);

  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="pt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">{order.customerEmail ?? "No email on file"}</div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              {order.id} · {fmtTs(order.created)}
              {order.amountTotal != null && ` · $${(order.amountTotal / 100).toFixed(2)}`}
            </div>
          </div>
          <Badge variant="outline" className={status.cls}>{status.label}</Badge>
        </div>

        {order.status !== "awaiting_uploads" && (
          <div className="space-y-2">
            {order.tracks.map((track) => {
              const master = order.masters[track.slot - 1];
              return (
                <div
                  key={track.slot}
                  className="flex flex-wrap items-center gap-2 border border-border/30 bg-background/40 px-3 py-2"
                >
                  <span className="text-xs font-bold w-14 shrink-0">Track {track.slot}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1 min-w-32">
                    {track.name ?? "—"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={!track.uploaded || busy !== null}
                    onClick={() => void downloadSource(track.slot)}
                  >
                    {busy === `src-${track.slot}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    Source
                  </Button>
                  {master.uploaded ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Master attached
                    </span>
                  ) : (
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept=".wav,.mp3,.aif,.aiff,.flac,.m4a,audio/*"
                        className="hidden"
                        disabled={busy !== null}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadMaster(track.slot, file);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium border border-amber-500/40 text-amber-400 cursor-pointer hover:bg-amber-500/10 transition-colors">
                        {busy === `master-${track.slot}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        Attach master
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {deliverResult && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {deliverResult}
          </div>
        )}

        {order.status === "files_submitted" && (
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              disabled={!allMastersUp || busy !== null}
              onClick={() => void deliver()}
            >
              {busy === "deliver" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {allMastersUp ? "Deliver to customer" : "Attach all 3 masters to deliver"}
            </Button>
          </div>
        )}
        {order.status === "delivered" && order.deliveredAt && (
          <p className="text-xs text-muted-foreground text-right">
            Delivered {new Date(order.deliveredAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersDashboard() {
  const { logout } = useAdminAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/weekend-special/admin/orders", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }
      const json = (await res.json()) as { orders?: Order[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setOrders(json.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 space-y-6">
        <AdminNav />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-amber-500" />
              Weekend Orders
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Paid weekend-special orders — download sources, attach masters, deliver.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
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

        {!orders && loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {orders && orders.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground border border-border/30 bg-card/20">
            No paid weekend-special orders yet.
          </div>
        )}

        {orders?.map((order) => (
          <OrderCard key={order.id} order={order} onChanged={() => void load()} />
        ))}
      </div>
    </Layout>
  );
}

export default function AdminOrders() {
  return (
    <AdminGate title="Weekend Orders" description="Enter your admin key to manage orders.">
      <OrdersDashboard />
    </AdminGate>
  );
}
