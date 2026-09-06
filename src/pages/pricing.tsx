import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAppState, type SubscriptionTier } from "@/lib/context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, X, Gift, CheckCircle2, Sparkles, Zap, Crown, Star, ArrowRight, PartyPopper, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { usePlanPrices, FALLBACK_PRICES, type PlanPrice } from "@/lib/usePlanPrices";
import { trackFunnelEvent } from "@/lib/useAnalytics";
import { trackEvent } from "@/lib/analytics";
import { StripePaymentForm } from "@/components/stripe-payment-form";
import { CreditWallet } from "@/components/credit-wallet";
import {
  getPlayBillingService,
  purchasePlaySubscription,
  restorePlayPurchases,
  formatPlayPrice,
  formatPlayBillingPeriod,
  PLAN_PLAY_SKUS,
  type PlayItemDetails,
} from "@/lib/playBilling";

type PlanId = "weekly" | "monthly" | "node_auditor";

// Product names must match Stripe product names exactly (as seeded by seed-products.ts)
const PLAN_PRODUCT_NAMES: Record<PlanId, string> = {
  weekly: "GravelKing Weekly",
  monthly: "GravelKing Studio",
  node_auditor: "Node Auditor",
};

const PRO_FEATURES = [
  { label: "The Foundry mastering", highlight: "Morris Law Kernel v3.5 presets" },
  { label: "10 WAV exports per rolling week", highlight: "Release-ready 44.1kHz output" },
  { label: "800 credits each paid billing period", highlight: "40 generated songs, or 10 masters, or a mix" },
  { label: "Unlimited MP3 exports", highlight: "No MP3 export cap" },
  { label: "Vocal Booth", highlight: "Record, clip, splice, and layer audio" },
  { label: "Free certificates", highlight: "Certify your eligible songs while you build trust" },
  { label: "Converter", highlight: "Convert supported audio formats" },
  { label: "No watermark", highlight: "Clean, professional output" },
  { label: "Cancel anytime", highlight: "No commitment, full control" },
];

const STUDIO_FEATURES = [
  { label: "The Foundry mastering", highlight: "Morris Law Kernel v3.5 with adjustable EQ, compression, and limiting" },
  { label: "Vocal Booth editing", highlight: "Record, clip, splice, and layer your performances" },
  { label: "JAX songwriting companion", highlight: "Develop lyrics, document co-writers, and preserve your creative timeline" },
  { label: "Unlimited included JAX certificates", highlight: "Shareable authorship and IP records" },
  { label: "40 WAV exports per rolling month", highlight: "Plus unlimited MP3 exports" },
  { label: "2,500 credits each paid month", highlight: "125 generated songs, 33 masters, or any mix" },
  { label: "Converter", highlight: "Prepare audio in supported delivery formats" },
  { label: "PDF export reports", highlight: "Shareable mastering and provenance certificates" },
  { label: "Priority support", highlight: "48-hour response guarantee" },
];

type SuccessInfo = { planId: PlanId; planName: string; ctaLabel: string; ctaHref: string } | null;

const PLAN_SUCCESS: Record<PlanId, { planName: string; ctaLabel: string; ctaHref: string }> = {
  weekly: {
    planName: "Pro",
    ctaLabel: "Master your first track",
    ctaHref: "/mastering",
  },
  monthly: {
    planName: "King",
    ctaLabel: "Open The Foundry",
    ctaHref: "/mastering",
  },
  node_auditor: {
    planName: "Node Auditor",
    ctaLabel: "Open the Kernel dashboard",
    ctaHref: "/kernel",
  },
};

export default function Pricing() {
  const { tier, activePromo, redeemPromo, revokePromo, isLoadingSubscription, refreshSubscription } = useAppState();
  const stripePlanPrices = usePlanPrices();
  const { toast } = useToast();
  const [loadingTier, setLoadingTier] = useState<PlanId | null>(null);
  // Non-null when running inside the Android app installed from Google Play —
  // purchases then go through Google Play Billing instead of Stripe.
  const [playPrices, setPlayPrices] = useState<Partial<Record<PlanId, PlayItemDetails>> | null>(null);
  const [playBillingChecked, setPlayBillingChecked] = useState(false);
  const [playEnvDetected, setPlayEnvDetected] = useState(false);
  const [trialEligible, setTrialEligible] = useState(true);
  const playMode = playPrices !== null;
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo>(null);
  const [paymentState, setPaymentState] = useState<{ clientSecret: string; intentType: "payment" | "setup"; planId: PlanId } | null>(null);
  const [unseeded, setUnseeded] = useState(false);
  const { isLoaded: authLoaded, isSignedIn: clerkSignedIn } = useAuth();
  // null = still loading (preserves the old tri-state semantics)
  const isSignedIn: boolean | null = authLoaded ? clerkSignedIn : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();

  // Trial eligibility (server truth) — never promise a free trial to an
  // account that already consumed its one trial.
  useEffect(() => {
    fetch("/api/subscription/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { trialEligible?: boolean } | null) => {
        if (d && d.trialEligible === false) setTrialEligible(false);
      })
      .catch(() => { /* default: show trial copy */ });
  }, []);

  // Detect Google Play Billing (only exists inside the Play-installed app).
  useEffect(() => {
    getPlayBillingService().then(async (service) => {
      if (!service) return;
      setPlayEnvDetected(true);
      try {
        const details = await service.getDetails(Object.values(PLAN_PLAY_SKUS));
        const byPlan: Partial<Record<PlanId, PlayItemDetails>> = {};
        (Object.entries(PLAN_PLAY_SKUS) as Array<[PlanId, string]>).forEach(([planId, sku]) => {
          const d = details.find((x) => x.itemId === sku);
          if (d) byPlan[planId] = d;
        });
        // Require the FULL catalog and a real Play billing period: with a
        // partial result or missing period we'd render a card with the wrong
        // price cadence or a button for an unavailable Play SKU.
        const allPresent = (Object.keys(PLAN_PLAY_SKUS) as PlanId[]).every((p) => {
          const d = byPlan[p];
          return Boolean(d && formatPlayBillingPeriod(d.subscriptionPeriod));
        });
        if (!allPresent) return; // stay on Stripe
        setPlayPrices(byPlan);
      } catch {
        /* stay on Stripe */
      }
    }).finally(() => setPlayBillingChecked(true));
  }, []);

  const verifyPlayToken = async (purchaseToken: string): Promise<boolean> => {
    const r = await fetch("/api/play/verify-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ purchaseToken }),
    });
    return r.ok;
  };

  // Auto-restore: a signed-in free-tier user inside the Play app may have an
  // existing purchase (reinstall, or verification failed right after buying).
  const restoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (!playMode || isSignedIn !== true || tier !== null || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    restorePlayPurchases(verifyPlayToken)
      .then((restored) => { if (restored > 0) refreshSubscription(); })
      .catch(() => {});
  }, [playMode, isSignedIn, tier]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prices shown on the cards: Google Play's when inside the Play app
  // (Google is the merchant of record there), Stripe's otherwise.
  const planPrices: Record<PlanId, PlanPrice> = playMode
    ? {
        weekly: playPrices?.weekly
          ? (() => {
              const amount = formatPlayPrice(playPrices.weekly);
              const period = formatPlayBillingPeriod(playPrices.weekly.subscriptionPeriod);
              return { amount, period, label: `${amount}${period}` };
            })()
          : FALLBACK_PRICES.weekly,
        monthly: playPrices?.monthly
          ? (() => {
              const amount = formatPlayPrice(playPrices.monthly);
              const period = formatPlayBillingPeriod(playPrices.monthly.subscriptionPeriod);
              return { amount, period, label: `${amount}${period}` };
            })()
          : FALLBACK_PRICES.monthly,
        node_auditor: playPrices?.node_auditor
          ? (() => {
              const amount = formatPlayPrice(playPrices.node_auditor);
              const period = formatPlayBillingPeriod(playPrices.node_auditor.subscriptionPeriod);
              return { amount, period, label: `${amount}${period}` };
            })()
          : FALLBACK_PRICES.node_auditor,
      }
    : stripePlanPrices;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch("/api/stripe/products", { credentials: "include" })
      .then((r) => r.json())
      .then((body: { data?: unknown[]; warning?: string }) => {
        if (body.warning ?? (Array.isArray(body.data) && body.data.length === 0)) {
          setUnseeded(true);
        }
      })
      .catch(() => { /* ignore — banner is dev-only best-effort */ });
  }, []);


  // After sign-in returns to /pricing?plan=X, resume the checkout the visitor
  // already chose — one less click between intent and Stripe. Waits for Play
  // Billing detection so a Play-app visitor is never routed to Stripe.
  const autoResumeRef = useRef(false);
  useEffect(() => {
    if (autoResumeRef.current || isSignedIn !== true) return;
    // Fail closed for ANY detected Play environment (even if its catalog
    // failed to load) — auto-resuming into Stripe there breaks Play policy.
    if (!playBillingChecked || playEnvDetected) return;
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get("plan") as PlanId | null;
    if (!planParam || !(planParam in PLAN_PRODUCT_NAMES)) return;
    autoResumeRef.current = true;
    window.history.replaceState({}, "", "/pricing");
    void refreshSubscription()
      .then(({ tier: freshTier }) => {
        if (!freshTier) void handleCheckout(planParam);
      })
      .catch(() => { /* leave the page interactive — visitor can click the plan */ });
  }, [isSignedIn, playBillingChecked, playEnvDetected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckout = async (planId: PlanId) => {
    trackFunnelEvent("plan_selected", { plan: planId });
    trackEvent("plan_selected", { plan: planId, location: "pricing_page" });
    // Require sign-in before checkout — the purchase must attach to an
    // account so it unlocks every platform, not just this device.
    if (!isSignedIn) {
      trackFunnelEvent("signin_required", { plan: planId });
      const search = new URLSearchParams(window.location.search);
      const utm = new URLSearchParams();
      search.forEach((value, key) => { if (key.startsWith("utm_")) utm.set(key, value); });
      const utmSuffix = utm.toString();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const returnTo = `${base}/pricing?plan=${encodeURIComponent(planId)}${utmSuffix ? `&${utmSuffix}` : ""}`;
      window.location.href = `${base}/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
      return;
    }

    // Inside the Play app, purchases go through Google Play Billing
    // (required by Play policy for digital subscriptions).
    if (playMode) {
      setLoadingTier(planId);
      try {
        await purchasePlaySubscription(PLAN_PLAY_SKUS[planId], verifyPlayToken);
        await refreshSubscription();
        setSuccessInfo({ planId, ...PLAN_SUCCESS[planId] });
      } catch (err) {
        // AbortError = user closed the Play sheet — not an error worth a toast.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          const message = err instanceof Error ? err.message : "Something went wrong";
          toast({ title: "Purchase error", description: message, variant: "destructive" });
        }
      } finally {
        setLoadingTier(null);
      }
      return;
    }

    // Fail closed inside the Play app: if the Play catalog didn't load we must
    // NOT fall back to Stripe — Play policy requires Play Billing in-app.
    if (playEnvDetected) {
      toast({
        title: "Google Play billing unavailable",
        description: "The Play catalog hasn't loaded. Close and reopen the app, then try again.",
        variant: "destructive",
      });
      return;
    }

    setLoadingTier(planId);
    try {
      const productsRes = await fetch("/api/stripe/products", { credentials: "include" });
      if (!productsRes.ok) throw new Error("Could not load products");
      const { data: products } = await productsRes.json() as { data: Array<{ name: string; prices: Array<{ id: string; recurring?: { interval: string } }> }> };

      const productName = PLAN_PRODUCT_NAMES[planId];
      const product = products.find((p) => p.name === productName);

      if (!product?.prices?.length) {
        toast({
          title: "Products not configured yet",
          description: "Run `pnpm --filter @workspace/scripts run seed-products` to create Stripe products, then try again.",
          variant: "destructive",
        });
        setLoadingTier(null);
        return;
      }

      const expectedInterval = "month";
      const priceId = product.prices.find((p) => p.recurring?.interval === expectedInterval)?.id;
      if (!priceId) throw new Error(`The selected plan has no ${expectedInterval} Stripe price.`);

      const checkoutRes = await fetch("/api/stripe/create-subscription-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId, plan: planId }),
      });

      if (!checkoutRes.ok) {
        const errData = await checkoutRes.json() as { error?: string; authRequired?: boolean };
        if (errData.authRequired) {
          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
          window.location.href = `${base}/sign-in?redirect_url=${encodeURIComponent(`${base}/pricing?plan=${planId}`)}`;
          return;
        }
        const errMsg = errData.error ?? "Checkout failed";
        trackFunnelEvent("checkout_error", { plan: planId, error: errMsg.slice(0, 100) });
        throw new Error(errMsg);
      }
      const payment = await checkoutRes.json() as { clientSecret?: string; intentType?: "payment" | "setup"; };
      if (!payment.clientSecret || !payment.intentType) throw new Error("Stripe did not return an in-app payment session.");
      setPaymentState({ clientSecret: payment.clientSecret, intentType: payment.intentType, planId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Checkout error", description: message, variant: "destructive" });
    } finally {
      setLoadingTier(null);
    }
  };

  const isCurrent = (planId: PlanId) => tier === planId;
  const isUpgrade = (planId: PlanId) => {
    const order: Array<SubscriptionTier> = [null, "weekly", "monthly", "node_auditor"];
    return order.indexOf(tier) < order.indexOf(planId);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-12 px-4">

        {/* Dev-only: Stripe products not seeded */}
        {import.meta.env.DEV && unseeded && (
          <div className="mb-8 flex items-start gap-3 border border-yellow-500/50 bg-yellow-500/[0.06] rounded-lg px-5 py-4" data-testid="unseeded-banner">
            <Terminal className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">Stripe products not seeded</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No active products were found in Stripe. Checkout buttons will not work until you seed the products.
              </p>
              <p className="mt-2 text-xs font-mono bg-black/30 border border-border/30 rounded px-3 py-1.5 text-yellow-200 inline-block select-all">
                pnpm --filter @workspace/scripts run seed-products
              </p>
            </div>
          </div>
        )}

        {paymentState && (
          <StripePaymentForm
            clientSecret={paymentState.clientSecret}
            intentType={paymentState.intentType}
            onCancel={() => setPaymentState(null)}
            onSuccess={async () => {
              // Stripe confirms the PaymentIntent before our webhook updates the
              // account row. Keep the embedded form open while that short
              // propagation window closes instead of making a successful
              // wallet/3DS payment look unfinished.
              for (let attempt = 0; attempt < 40; attempt += 1) {
                const status = await refreshSubscription();
                if (status.tier) {
                  setPaymentState(null);
                  setSuccessInfo({ planId: paymentState.planId, ...PLAN_SUCCESS[paymentState.planId] });
                  return;
                }
                await new Promise((resolve) => setTimeout(resolve, 750));
              }
              toast({
                title: "Payment received — still syncing",
                description: "Your payment cleared, but the subscription is taking longer than usual to activate. You can retry the confirmation or close this panel and refresh your status later.",
              });
            }}
          />
        )}

        {/* Subscription success banner */}
        <AnimatePresence>
          {successInfo && (
            <motion.div
              key="success-banner"
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="mb-10 relative overflow-hidden border border-emerald-500/40 bg-emerald-500/[0.06] rounded-xl px-6 py-6 sm:px-8 sm:py-7"
              data-testid="success-banner"
            >
              {/* Subtle glow */}
              <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-emerald-500/20" />

              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                {/* Icon */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <PartyPopper className="w-6 h-6 text-emerald-400" />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-emerald-300 leading-snug">
                    You're subscribed!
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground">{successInfo.planName}</span> is now active — all features are unlocked and ready to use.
                  </p>
                </div>

                {/* CTA */}
                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    asChild
                    className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                    data-testid="success-banner-cta"
                  >
                    <a href={successInfo.ctaHref}>
                      {successInfo.ctaLabel}
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </a>
                  </Button>
                  <button
                    onClick={() => setSuccessInfo(null)}
                    aria-label="Dismiss"
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    data-testid="success-banner-dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sales headline — problem → solution */}
        <div className="text-center mb-10">
          <motion.h1
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Choose your plan.
          </motion.h1>
          <motion.p
            className="text-muted-foreground text-lg max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            King is the recommended plan for independent artists — JAX, Vocal Booth, The Foundry, and Converter in one subscription.
            {trialEligible && !playMode && (
              <span className="block text-sm text-emerald-400 font-medium mt-2">
                New accounts get a 7-day free trial on King. Card required at checkout — cancel anytime during the trial.
              </span>
            )}
          </motion.p>
        </div>

        <CreditWallet signedIn={isSignedIn === true} />

        {/* Trust badges — social proof above the fold */}
        <motion.div
          className="flex flex-wrap justify-center gap-4 mb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {(playMode
            ? [
                "Billed securely through Google Play",
                "Cancel anytime in the Play Store",
                "One subscription — unlocks web too",
              ]
            : trialEligible
              ? [
                  "Sign in to start your free trial",
                  "Cancel anytime — 1-click in app",
                  "7-day free trial on King",
                  "One trial per account, ever",
                ]
              : [
                  "Cancel anytime — 1-click in app",
                  "Your one free trial has been used",
                  "Subscriptions start right away",
                ]
          ).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border/30 rounded-full px-3 py-1">
              <Check className="w-3 h-3 text-emerald-500" />{t}
            </span>
          ))}
        </motion.div>

        {/* Promo Code — active banner */}
        <AnimatePresence>
          {activePromo && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-8 flex items-center justify-between gap-4 border border-amber-500/40 bg-amber-500/5 px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-400">Promo active — Node Auditor unlocked</p>
                  <p className="text-xs text-muted-foreground mt-0.5">All features are enabled for free via your promo code.</p>
                </div>
              </div>
              <button
                onClick={() => { revokePromo(); toast({ title: "Promo removed", description: "Access reverted to your base plan." }); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                Remove
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Starter — decoy anchor makes paid plans feel like a bargain */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="flex flex-col h-full border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="text-lg">Free</CardTitle>
                <CardDescription>Try every tool, no account needed</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">Free</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <FeatureRow yes>JAX songwriting companion</FeatureRow>
                   <FeatureRow yes>Try JAX songwriting</FeatureRow>
                   <FeatureRow yes>Preview The Foundry</FeatureRow>
                  <FeatureRow yes={false}>Converter access</FeatureRow>
                   <FeatureRow yes={false}>Pro Vocal Booth</FeatureRow>
                  <FeatureRow yes={false}>Full-length mastering exports</FeatureRow>
                </ul>
              </CardContent>
              <CardFooter>
                {isLoadingSubscription ? (
                  <div className="w-full flex justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : tier === null ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-secondary/50" data-testid="badge-current-plan">
                    Current Plan
                  </Badge>
                ) : (
                  <Button variant="outline" className="w-full" disabled>On paid plan</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* Pro — expanded bullet list, loss-aversion framing */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="flex flex-col h-full border-emerald-500/30 bg-card/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                FLEXIBLE
              </div>
              <CardHeader>
                <CardTitle className="text-lg text-emerald-400">Pro</CardTitle>
                <CardDescription>All four tools for your creative workflow</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">{planPrices.weekly.amount}</span>
                  <span className="text-muted-foreground text-sm">{planPrices.weekly.period}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium">{playMode ? "Billed via Google Play · Cancel anytime" : trialEligible ? "3-day free trial · Cancel anytime" : "Cancel anytime"}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Everything in Free, plus:</li>
                  {PRO_FEATURES.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="block leading-snug">{f.label}</span>
                        <span className="text-[11px] text-muted-foreground/60">{f.highlight}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent("weekly") ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-emerald-500/10 text-emerald-400 border-emerald-500/20" data-testid="badge-weekly-current">
                    Current Plan
                  </Badge>
                ) : isUpgrade("weekly") ? (
                  <Button
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                    onClick={() => handleCheckout("weekly")}
                    disabled={loadingTier !== null}
                    data-testid="button-upgrade-weekly"
                  >
                    {loadingTier === "weekly" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : isSignedIn === false ? (playMode || !trialEligible ? "Sign in to subscribe" : "Sign in for 3-day trial") : "Get Pro"}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>Lower tier</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* King — hero card, anchoring + value-stack, 10+ bullets, scarcity cue */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="flex flex-col h-full border-amber-500/40 bg-amber-500/[0.03] relative overflow-hidden ring-1 ring-amber-500/20">
              <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                <Star className="w-3 h-3" /> ARTIST PLAN
              </div>
              <CardHeader>
                <CardTitle className="text-lg text-amber-500 flex items-center gap-2">
                  <Crown className="w-4 h-4" /> King
                </CardTitle>
                <CardDescription>Advanced access to JAX, Vocal Booth, The Foundry, and Converter</CardDescription>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{planPrices.monthly.amount}</span>
                  <span className="text-muted-foreground text-sm">{planPrices.monthly.period}</span>
                  {!playMode && trialEligible && <span className="text-xs text-emerald-400 font-medium ml-1">7-day free trial</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">
                     <ArrowRight className="w-3 h-3 mr-1" />2,500 credits reset monthly
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1">Everything in Pro, plus:</li>
                  {STUDIO_FEATURES.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="block leading-snug">{f.label}</span>
                        <span className="text-[11px] text-muted-foreground/60">{f.highlight}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-amber-500/80 italic">
                  “The four-tool workflow keeps songwriting, recording, mastering, and conversion together.”
                </p>
              </CardContent>
              <CardFooter>
                {isLoadingSubscription ? (
                  <div className="w-full flex justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : isCurrent("monthly") ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-amber-500/10 text-amber-500 border-amber-500/20" data-testid="badge-studio-current">
                    Current Plan
                  </Badge>
                ) : isUpgrade("monthly") ? (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    onClick={() => handleCheckout("monthly")}
                    disabled={loadingTier !== null}
                    data-testid="button-upgrade-studio"
                  >
                    {loadingTier === "monthly" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : isSignedIn === false ? (playMode || !trialEligible ? "Sign in to subscribe" : "Sign in for 7-day trial") : playMode || !trialEligible ? "Get King" : "Start Free Trial — Get King"}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>Lower tier</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* Node Auditor — enterprise anchor, high contrast */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="flex flex-col h-full border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="text-lg">Node Auditor</CardTitle>
                <CardDescription>Unlimited optimization runs — up to 100 devices, personal use</CardDescription>
                <div className="mt-3">
                  <span className="text-lg font-semibold text-muted-foreground">Contact us for access</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <FeatureRow yes>Everything in King</FeatureRow>
                  <FeatureRow yes>Unlimited MLK V3.5 optimizer runs</FeatureRow>
                  <FeatureRow yes>Up to 100 devices optimized</FeatureRow>
                  <FeatureRow yes>White-label WAV &amp; PDF exports</FeatureRow>
                  <FeatureRow yes>Morris Law V3.5 access</FeatureRow>
                  <FeatureRow yes>Custom benchmark reports</FeatureRow>
                  <FeatureRow yes={false}>Commercial resale or scaling</FeatureRow>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground border border-border/30 rounded px-3 py-2">
                  Personal use only. Need to optimize at scale or resell?{" "}
                  <a href="/contact" className="text-amber-500 underline">Contact us for a commercial license.</a>
                </p>
              </CardContent>
              <CardFooter>
                {isLoadingSubscription ? (
                  <div className="w-full flex justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : isCurrent("node_auditor") ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm" data-testid="badge-auditor-current">
                    Current Plan
                  </Badge>
                ) : isUpgrade("node_auditor") ? (
                  <a href="/contact" className="block">
                    <Button variant="outline" className="w-full" data-testid="button-contact-auditor">
                      Contact me
                    </Button>
                  </a>
                ) : (
                  <Button variant="outline" className="w-full" disabled>Lower tier</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>
        </div>

        {/* Risk reversal / FAQ strip */}
        <motion.div
          className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {[
            { title: "30-day money-back guarantee", sub: "Not satisfied? Full refund, no questions." },
            { title: "Your data stays private", sub: "Files are processed securely and never permanently stored." },
            { title: "Works on any device", sub: "Desktop, tablet, phone — no install needed." },
          ].map((b) => (
            <div key={b.title} className="border border-border/30 rounded-lg p-4 bg-card/10">
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{b.sub}</p>
            </div>
          ))}
        </motion.div>

        {/* Promo Code Entry */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-10 max-w-md mx-auto"
        >
          <div className="border border-border/40 bg-card/20 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">Have a promo code?</span>
            </div>
            {activePromo ? (
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-400">Code applied — all tools unlocked</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Enjoy full Node Auditor access, on the house.</p>
                </div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPromoError(false);
                   const ok = await redeemPromo(promoInput);
                  if (ok) {
                    setPromoInput("");
                    toast({
                      title: "Promo code accepted!",
                      description: "Node Auditor access is now unlocked — all tools are yours.",
                    });
                  } else {
                    setPromoError(true);
                    inputRef.current?.select();
                  }
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value); setPromoError(false); }}
                  placeholder="Enter promo code"
                  className={`flex-1 bg-secondary/40 border px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 transition-colors ${
                    promoError ? "border-destructive/60 text-destructive" : "border-border/40"
                  }`}
                />
                <Button type="submit" disabled={!promoInput.trim()} className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4">
                  Apply
                </Button>
              </form>
            )}
            {promoError && (
              <p className="text-xs text-destructive">Invalid promo code — check the code and try again.</p>
            )}
          </div>
        </motion.div>

      </div>
    </Layout>
  );
}

function FeatureRow({ yes = true, children }: { yes?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      {yes
        ? <Check className="w-4 h-4 text-emerald-500 shrink-0" />
        : <X className="w-4 h-4 text-border shrink-0" />
      }
      <span className={yes ? "" : "opacity-40"}>{children}</span>
    </li>
  );
}
