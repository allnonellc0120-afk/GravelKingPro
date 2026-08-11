import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Link2,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  MousePointerClick,
  Users,
  DollarSign,
  Wallet,
} from "lucide-react";

interface Promoter {
  id: string;
  code: string;
  displayName: string | null;
  status: "pending" | "approved" | "rejected";
  commissionRate: number;
  createdAt: string;
}

interface Commission {
  id: string;
  invoiceAmountCents: number;
  commissionCents: number;
  currency: string;
  status: "pending" | "paid" | "reversed";
  createdAt: string;
}

interface MeResponse {
  promoter: Promoter | null;
  stats?: {
    clicks: number;
    conversions: number;
    pendingCents: number;
    paidCents: number;
  };
  commissions?: Commission[];
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="text-primary">{icon}</div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PromotersPage() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<MeResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/promoter/me", { credentials: "include" });
      if (res.status === 401) {
        setAuthed(false);
        setData(null);
        return;
      }
      setAuthed(true);
      setData((await res.json()) as MeResponse);
    } catch {
      setError("Could not load promoter status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/promoter/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, payoutDetails }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Registration failed");
        return;
      }
      await refresh();
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [displayName, payoutDetails, refresh]);

  const promoter = data?.promoter ?? null;
  const link = promoter ? `${window.location.origin}/?ref=${promoter.code}` : "";

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [link]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Promoter Program</h1>
          <p className="text-muted-foreground mt-2">
            Share your tracked link. When someone you refer subscribes, you earn a
            commission on every invoice they actually pay — automatically tracked,
            no middleman.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !authed ? (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <p>Sign in to register as a promoter and get your tracked link.</p>
              <Button onClick={() => (window.location.href = "/api/login")}>Sign in</Button>
            </CardContent>
          </Card>
        ) : !promoter ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">Become a promoter</h2>
              <p className="text-sm text-muted-foreground">
                Registration is free. Once approved, you earn a commission on every
                paid subscription invoice from people who sign up through your link.
              </p>
              <Input
                placeholder="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
              />
              <Input
                placeholder="Payout details — e.g. PayPal email (optional, needed before payout)"
                value={payoutDetails}
                onChange={(e) => setPayoutDetails(e.target.value)}
                maxLength={500}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={register} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Register as promoter
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-xl font-semibold">Your tracked link</h2>
                  {promoter.status === "approved" ? (
                    <span className="inline-flex items-center gap-1 text-sm text-green-500">
                      <CheckCircle2 className="h-4 w-4" /> Approved · {promoter.commissionRate}% commission
                    </span>
                  ) : promoter.status === "pending" ? (
                    <span className="inline-flex items-center gap-1 text-sm text-yellow-500">
                      <Clock className="h-4 w-4" /> Awaiting approval
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-destructive">
                      <XCircle className="h-4 w-4" /> Not approved
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={link} className="font-mono text-sm" />
                  <Button variant="outline" onClick={copyLink}>
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                {promoter.status === "pending" && (
                  <p className="text-sm text-muted-foreground">
                    Your link starts tracking clicks and commissions once an admin approves your account.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<MousePointerClick className="h-6 w-6" />} label="Clicks" value={String(data?.stats?.clicks ?? 0)} />
              <StatCard icon={<Users className="h-6 w-6" />} label="Conversions" value={String(data?.stats?.conversions ?? 0)} />
              <StatCard icon={<DollarSign className="h-6 w-6" />} label="Pending earnings" value={usd(data?.stats?.pendingCents ?? 0)} />
              <StatCard icon={<Wallet className="h-6 w-6" />} label="Paid out" value={usd(data?.stats?.paidCents ?? 0)} />
            </div>

            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Link2 className="h-5 w-5" /> Commission history
                </h2>
                {(data?.commissions?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No commissions yet. Commissions appear here when a referred
                    subscriber pays an invoice (trials don't count until they convert).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data!.commissions!.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
                        <span className="text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                        <span>Invoice {usd(c.invoiceAmountCents)}</span>
                        <span className="font-medium">{usd(c.commissionCents)}</span>
                        <span
                          className={
                            c.status === "paid"
                              ? "text-green-500"
                              : c.status === "reversed"
                                ? "text-destructive line-through"
                                : "text-yellow-500"
                          }
                        >
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
