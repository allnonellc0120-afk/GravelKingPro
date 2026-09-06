# Apple Pay / Google Pay checkout — verification & manual QA

## Status (PMD verified 2026-09-06; republish required for the live asset)

**Domain registration.** `gravelkingpro.com` is registered as a Stripe Payment
Method Domain (`pmd_1UCKnWCxsQjjsZPGbAEsuCv6`) with `apple_pay: active` and
`google_pay: active`, validated via `POST /v1/payment_method_domains/:id/validate`.
The association URL currently returns HTTP 200 with the SPA fallback HTML on the
deployed site; republish the web artifact, then run `pnpm wallet:verify` before
considering the live wallet path healthy.
(The legacy `gravelkingpro.it.com` domain is dead — it 404s; the live domain is
`gravelkingpro.com`.)

**Card path (Payment Element).** Verified end-to-end in dev against Stripe test
mode: created a subscription SetupIntent via `POST /api/stripe/create-subscription-intent`,
mounted `PaymentElement` + `ExpressCheckoutElement`, filled the card fields with
`4242 4242 4242 4242`, and confirmed with the exact call the component uses
(`stripe.confirmSetup({ elements, confirmParams: { return_url }, redirect: "if_required" })`).
Result: `setupIntent.status === "succeeded"`.

## Publish gate

Run the wallet verification before publishing and immediately after every
publish:

```bash
pnpm wallet:verify
```

The command fails loudly unless both checks pass:

- the live `.well-known` URL returns HTTP 200 with the verification file
  instead of the SPA fallback HTML; and
- Stripe's Payment Method Domain validation reports both `apple_pay` and
  `google_pay` as `active`.

The web prerender step fetches Stripe's canonical Apple verification file into
`dist/public/.well-known` and fails the production build if Stripe does not
return a valid file, preventing a publish from silently dropping it. The root
`pnpm publish:check` runs that production build as a required pre-publish check.

## Why the wallet path can't be fully automated

Apple Pay only appears on Safari with an Apple Pay–enabled device; Google Pay
requires Chrome with a card saved to a signed-in Google account. Headless Linux
Chromium reports `availablePaymentMethods: { applePay: false, googlePay: false }`
— Stripe itself gates the buttons, so no automated run in this environment can
exercise the wallet `onConfirm` path. The code path was reviewed: both wallets
and the card button funnel into the same `confirm()` helper in
`artifacts/gravelkingpro/src/components/stripe-payment-form.tsx` (the wallet
`onConfirm` handler calls the identical `confirmPayment`/`confirmSetup` with
`redirect: "if_required"`), so the card-path proof above covers the shared
confirmation logic.

## Manual QA script (run on a real device after each checkout change)

1. **iPhone/iPad (Safari) or Android (Chrome, signed in, card saved)** — open
   `https://gravelkingpro.com/pricing` and sign in.
2. Tap **Get Pro** (or King). The wallet button (Apple Pay / Google Pay) should
   render above "or pay by card".
3. Tap the wallet button, authorize with Face ID / fingerprint.
4. Expected: the sheet closes, no error banner appears, and the success view
   ("You're subscribed!") renders without a page redirect.
5. Verify in Stripe Dashboard → Payments that the PaymentIntent/SetupIntent
   succeeded and the subscription is active.
6. Regression check: repeat with the card form ("or pay by card") to confirm
   the Payment Element path still completes.

## If the wallet button disappears in production

- Confirm the Payment Method Domain still validates:
  `stripe payment_method_domains validate pmd_1UCKnWCxsQjjsZPGbAEsuCv6`
- Confirm the association file still serves 200 (it must be reachable
  publicly, unauthenticated, at the `.well-known` path above).
- Wallet buttons never render on unsupported devices — absence on desktop
  Linux/Windows Chrome without saved cards is expected, not a bug.
