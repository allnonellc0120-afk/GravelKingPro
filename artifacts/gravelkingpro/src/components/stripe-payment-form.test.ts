import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./stripe-payment-form.tsx", import.meta.url)),
  "utf8",
);

if (source.includes('phone: "never"')) {
  throw new Error("Stripe Payment Element must not disable phone collection without a confirmPayment phone payload.");
}
if (!source.includes('phone: "auto"')) {
  throw new Error("Stripe Payment Element must explicitly use Stripe's automatic phone collection mode.");
}
if (!source.includes("stripe.confirmPayment({")) {
  throw new Error("Credit checkout must continue to confirm through stripe.confirmPayment.");
}

console.log("stripe payment form validation: ok");