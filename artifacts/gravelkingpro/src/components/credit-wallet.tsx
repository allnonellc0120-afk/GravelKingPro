import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StripePaymentForm } from "@/components/stripe-payment-form";

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  amountCents: number;
  description: string;
};

export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/credits/balance", { credentials: "include" });
      if (!response.ok) {
        setBalance(null);
        return null;
      }
      const data = await response.json() as { creditsBalance?: number };
      const next = Number.isInteger(data.creditsBalance) ? data.creditsBalance! : 0;
      setBalance(next);
      return next;
    } catch {
      setBalance(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { balance, loading, refresh };
}

export function CreditWallet({ signedIn = true }: { signedIn?: boolean }) {
  const { balance, loading, refresh } = useCredits();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ secret: string; credits: number; amountCents: number; startingBalance: number | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stripe/credit-packs", { credentials: "include" })
      .then((response) => response.json() as Promise<{ data?: CreditPack[] }>)
      .then((data) => setPacks(Array.isArray(data.data) ? data.data : []))
      .catch(() => setPacks([]));
  }, []);

  const buy = async (pack: CreditPack) => {
    if (!signedIn) {
      window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in?redirect_url=${encodeURIComponent(`${import.meta.env.BASE_URL}pricing#credits`)}`;
      return;
    }
    setBusyPack(pack.id);
    setError("");
    try {
      const response = await fetch("/api/stripe/create-credit-purchase-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ packId: pack.id }),
      });
      const data = await response.json() as { clientSecret?: string; error?: string };
      if (!response.ok || !data.clientSecret) throw new Error(data.error ?? "Could not start credit checkout.");
      setPayment({ secret: data.clientSecret, credits: pack.credits, amountCents: pack.amountCents, startingBalance: balance });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start credit checkout.");
    } finally {
      setBusyPack(null);
    }
  };

  const confirmPurchase = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const next = await refresh();
      if (next !== null && (payment?.startingBalance === null || next > payment!.startingBalance)) {
        setPayment(null);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    setPayment(null);
  };

  return (
    <section id="credits" className="mt-10 rounded-xl border border-sky-500/30 bg-sky-500/[0.04] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-sky-300" />
            <h2 className="text-xl font-bold">Credits wallet</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
             Buy credits when you want to generate or master without subscribing.
          </p>
        </div>
        <div className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wider text-sky-200/70">Your balance</p>
          <p className="text-2xl font-bold text-sky-200">
            {loading ? "…" : balance === null ? "Sign in" : balance}
            {balance !== null && <span className="ml-1 text-sm font-normal text-sky-200/70">credits</span>}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {packs.map((pack) => (
          <div key={pack.id} className="rounded-lg border border-border/40 bg-background/30 p-4">
            <p className="font-semibold">{pack.name}</p>
            <p className="mt-1 text-2xl font-bold">{pack.credits} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{pack.description}</p>
            <Button
              className="mt-3 w-full bg-sky-500 text-black hover:bg-sky-400"
              onClick={() => void buy(pack)}
              disabled={busyPack !== null || !!payment}
            >
              {busyPack === pack.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Buy ${(pack.amountCents / 100).toFixed(2)}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
         <span>Song generation: <strong className="text-foreground">20 credits</strong></span>
         <span>Master + download: <strong className="text-foreground">75 credits</strong></span>
         <span>Certificate: <strong className="text-foreground">Free</strong> with Pro</span>
      </div>

      {payment && (
        <StripePaymentForm
          clientSecret={payment.secret}
          intentType="payment"
          submitLabel={`Buy ${payment.credits} credits for $${(payment.amountCents / 100).toFixed(2)}`}
          onCancel={() => setPayment(null)}
          onSuccess={confirmPurchase}
        />
      )}
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-sky-300" /> Payment details are handled by Stripe
      </p>
    </section>
  );
}