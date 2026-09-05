import { useEffect, useMemo, useState } from "react";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, X } from "lucide-react";

type Props = {
  clientSecret: string;
  intentType: "payment" | "setup";
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
  /** Optional override for the submit button (e.g. "Pay $1.99"). */
  submitLabel?: string;
};

function PaymentForm({ intentType, onSuccess, onCancel, submitLabel }: Omit<Props, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = intentType === "setup"
        ? await stripe.confirmSetup({
            elements,
            confirmParams: { return_url: window.location.href },
            redirect: "if_required",
          })
        : await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: window.location.href },
            redirect: "if_required",
          });
      if (result.error) {
        setError(
          result.error.type === "card_error"
            ? (result.error.message ?? "Your payment was declined. Check the details and try again.")
            : (result.error.message ?? "Payment could not be confirmed. You can safely try again."),
        );
        return;
      }
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be confirmed.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = () => void confirm();

  // Apple Pay / Google Pay complete through the Express Checkout element's
  // own confirmation event — without this handler the wallet buttons render
  // but can't finish the payment.
  const onExpressConfirm = () => void confirm();

  return (
    <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold text-foreground">Secure in-app checkout</p>
          <p className="text-xs text-muted-foreground mt-1">Card, Apple Pay, and Google Pay appear automatically when available.</p>
        </div>
        <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close checkout">
          <X className="w-4 h-4" />
        </button>
      </div>
       <ExpressCheckoutElement
         onConfirm={onExpressConfirm}
         options={{
           buttonType: { applePay: "buy", googlePay: "buy" },
           buttonTheme: { applePay: "black", googlePay: "black" },
           layout: { maxColumns: 2, maxRows: 1 },
         }}
       />
       <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
         <span className="h-px flex-1 bg-border/60" />
         <span>or pay by card</span>
         <span className="h-px flex-1 bg-border/60" />
       </div>
       <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
      <Button onClick={submit} disabled={!stripe || !elements || submitting} className="w-full mt-5 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold">
        {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirming securely…</> : submitLabel ?? (intentType === "setup" ? "Save payment method securely" : "Confirm subscription")}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Payment details are handled by Stripe
      </p>
    </div>
  );
}

export function StripePaymentForm(props: Props) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/stripe/config", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json() as { publishableKey?: string; error?: string };
        if (!response.ok || !body.publishableKey) throw new Error(body.error ?? "Stripe is unavailable.");
        setPublishableKey(body.publishableKey);
      })
      .catch((err) => setConfigError(err instanceof Error ? err.message : "Stripe is unavailable."));
  }, []);

  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => publishableKey ? loadStripe(publishableKey) : null,
    [publishableKey],
  );

  if (configError) return <p className="mt-4 text-sm text-red-400">{configError}</p>;
  if (!stripePromise) return <div className="mt-5 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading secure checkout…</div>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#10b981", borderRadius: "8px" } } }}>
      <PaymentForm intentType={props.intentType} onSuccess={props.onSuccess} onCancel={props.onCancel} submitLabel={props.submitLabel} />
    </Elements>
  );
}