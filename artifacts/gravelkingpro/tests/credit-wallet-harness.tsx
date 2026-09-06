import { createRoot } from "react-dom/client";
import { CreditWallet } from "@/components/credit-wallet";
import type { StripePaymentFormProps } from "@/components/stripe-payment-form";
import "@/index.css";

/**
 * This harness replaces only Stripe's iframe-backed form. The wallet itself
 * remains the production component, so the browser test can verify the state
 * transition after a successful Payment Element confirmation without using
 * live payment credentials.
 */
function TestPaymentElement({ onSuccess, submitLabel }: StripePaymentFormProps) {
  return (
    <div data-testid="test-payment-element">
      <p>Test Payment Element</p>
      <button type="button" onClick={() => void onSuccess()}>
        {submitLabel}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <CreditWallet signedIn paymentForm={TestPaymentElement} />,
);