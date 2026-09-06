import { useState } from "react";
import { createElement } from "react";
import { useToast } from "@/hooks/use-toast";
import { StripePaymentForm } from "@/components/stripe-payment-form";

/**
 * In-app track purchase: requests a PaymentIntent from the server and renders
 * the shared embedded Stripe checkout (card / Apple Pay / Google Pay) instead
 * of redirecting to hosted Stripe Checkout. After Stripe confirms, the
 * purchase is recorded via /api/tracks/confirm-purchase (the webhook does the
 * same server-side — both paths are idempotent).
 */
export function useTrackPurchase() {
  const { toast } = useToast();
  const [buying, setBuying] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{ trackId: string; clientSecret: string; paymentIntentId: string } | null>(null);

  const buy = async (trackId: string) => {
    setBuying(trackId);
    try {
      const r = await fetch(`/api/tracks/${trackId}/payment-intent`, { method: "POST", credentials: "include" });
      const data = await r.json() as { clientSecret?: string; paymentIntentId?: string; error?: string };
      if (!r.ok || !data.clientSecret || !data.paymentIntentId) {
        throw new Error(data.error || "Please try again.");
      }
      setCheckout({ trackId, clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId });
    } catch (err) {
      toast({
        title: "Purchase failed",
        description: err instanceof Error ? err.message : "Could not start checkout.",
        variant: "destructive",
      });
    } finally {
      setBuying(null);
    }
  };

  const confirmPurchase = async (paymentIntentId: string) => {
    await fetch("/api/tracks/confirm-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentIntentId }),
    }).catch(() => {});
  };

  const checkoutElement = checkout
    ? createElement(StripePaymentForm, {
        clientSecret: checkout.clientSecret,
        intentType: "payment" as const,
        submitLabel: "Pay $9.99",
        onCancel: () => setCheckout(null),
        onSuccess: async () => {
          await confirmPurchase(checkout.paymentIntentId);
          setCheckout(null);
          toast({ title: "Purchase complete!", description: "Your track is now in your library." });
        },
      })
    : null;

  return { buy, buying, checkoutElement };
}
