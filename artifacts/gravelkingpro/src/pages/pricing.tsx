import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAppState, type SubscriptionTier } from "@/lib/context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, X, Gift, CheckCircle2, Sparkles, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type PlanId = "splits" | "pro" | "node_auditor";
type BillingInterval = "weekly" | "monthly";

const PLAN_PRODUCT_NAMES: Record<PlanId, string> = {
  splits: "GravelKing Splits",
  pro: "GravelKing Pro",
  node_auditor: "Node Auditor",
};

export default function Pricing() {
  const { tier, setTier, activePromo, redeemPromo, revokePromo } = useAppState();
  const { toast } = useToast();
  const [loadingTier, setLoadingTier] = useState<PlanId | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState(false);
  const [proBilling, setProBilling] = useState<BillingInterval>("monthly");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");

    if (checkout === "success" && sessionId) {
      fetch(`/api/stripe/subscription-status?session_id=${sessionId}`, { credentials: "include" })
        .then(r => r.json())
        .then((data: any) => {
          if (data.active) {
            const newTier = (data.tier as SubscriptionTier) ?? "pro";
            setTier(newTier);
            const labels: Record<string, string> = {
              splits: "GravelKing Splits",
              pro: "GravelKing Pro",
              node_auditor: "Node Auditor",
            };
            toast({
              title: `You're now on ${labels[newTier] ?? "a paid plan"}!`,
              description: newTier === "splits"
                ? "Voice removal and stem splitting are now unlocked."
                : "All features unlocked. Welcome aboard.",
            });
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", "/pricing");
    } else if (checkout === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charge was made.", variant: "destructive" });
      window.history.replaceState({}, "", "/pricing");
    }
  }, []);

  const handleCheckout = async (planId: PlanId, interval?: BillingInterval) => {
    setLoadingTier(planId);
    try {
      const productsRes = await fetch("/api/stripe/products");
      const { data: products } = await productsRes.json() as { data: any[] };

      const productName = PLAN_PRODUCT_NAMES[planId];
      const product = products.find((p: any) => p.name === productName);

      if (!product?.prices?.length) {
        toast({
          title: "Products not configured yet",
          description: "Run `pnpm --filter @workspace/scripts run seed-products` to create Stripe products, then try again.",
          variant: "destructive",
        });
        setLoadingTier(null);
        return;
      }

      // For Pro, pick the price matching the chosen billing interval
      let priceId: string;
      if (planId === "pro" && interval) {
        const stripeInterval = interval === "weekly" ? "week" : "month";
        const match = product.prices.find((p: any) => p.recurring?.interval === stripeInterval);
        priceId = match?.id ?? product.prices[0].id;
      } else {
        priceId = product.prices[0].id;
      }

      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await checkoutRes.json() as { url?: string; error?: string };
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err: any) {
      toast({ title: "Checkout error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTier(null);
    }
  };

  const isCurrent = (planId: PlanId) => tier === planId;
  const isUpgrade = (planId: PlanId) => {
    const order: Array<SubscriptionTier> = [null, "splits", "pro", "node_auditor"];
    return order.indexOf(tier) < order.indexOf(planId);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-12 px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Pricing Plans</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Start free. Unlock stem splitting with Splits, or get the full studio experience with Pro.
          </p>
        </div>

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

          {/* Free / Starter */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="flex flex-col h-full border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="text-lg">Starter</CardTitle>
                <CardDescription>Basic access, no account needed</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">Free</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <FeatureRow yes>Basic kernel analysis</FeatureRow>
                  <FeatureRow yes>Server-side processing</FeatureRow>
                  <FeatureRow yes>Audio preview</FeatureRow>
                  <FeatureRow yes={false}>Stem splitting / voice removal</FeatureRow>
                  <FeatureRow yes={false}>Download processed audio</FeatureRow>
                  <FeatureRow yes={false}>Full Audio Studio</FeatureRow>
                </ul>
              </CardContent>
              <CardFooter>
                {tier === null ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm" data-testid="badge-current-plan">
                    Current Plan
                  </Badge>
                ) : (
                  <Button variant="outline" className="w-full" disabled>On paid plan</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* GravelKing Splits */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="flex flex-col h-full border-emerald-500/30 bg-card/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                NEW
              </div>
              <CardHeader>
                <CardTitle className="text-lg text-emerald-400">GravelKing Splits</CardTitle>
                <CardDescription>Voice removal + stem splitting</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">$9.99</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <FeatureRow yes>Everything in Starter</FeatureRow>
                  <FeatureRow yes>Unlimited voice removal</FeatureRow>
                  <FeatureRow yes>Unlimited stem splitting</FeatureRow>
                  <FeatureRow yes>Download all stems as WAV</FeatureRow>
                  <FeatureRow yes>Processing history</FeatureRow>
                  <FeatureRow yes={false}>Full Audio Studio (kernel)</FeatureRow>
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent("splits") ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-emerald-500/10 text-emerald-400 border-emerald-500/20" data-testid="badge-splits-current">
                    Current Plan
                  </Badge>
                ) : isUpgrade("splits") ? (
                  <Button
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                    onClick={() => handleCheckout("splits")}
                    disabled={loadingTier !== null}
                    data-testid="button-upgrade-splits"
                  >
                    {loadingTier === "splits" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : "Get Splits"}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>Lower tier</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* GravelKing Pro */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="flex flex-col h-full border-amber-500/30 bg-card/60 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                POPULAR
              </div>
              <CardHeader>
                <CardTitle className="text-lg text-amber-500">GravelKing Pro</CardTitle>
                <CardDescription>Full studio for audio professionals</CardDescription>

                {/* Weekly / Monthly toggle */}
                <div className="mt-3 flex items-center gap-1 bg-secondary/40 rounded-lg p-1 w-fit">
                  <button
                    onClick={() => setProBilling("weekly")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      proBilling === "weekly"
                        ? "bg-amber-500 text-black shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setProBilling("monthly")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      proBilling === "monthly"
                        ? "bg-amber-500 text-black shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Monthly
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {proBilling === "weekly" ? (
                    <motion.div
                      key="weekly"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-2"
                    >
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">$9.99</span>
                        <span className="text-muted-foreground text-sm">/week</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span className="text-xs text-amber-400 font-medium">Flexible, cancel anytime</span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="monthly"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-2"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold">$19.99</span>
                        <span className="text-muted-foreground text-sm line-through opacity-50">$29.99</span>
                        <span className="text-muted-foreground text-sm">/mo</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full">
                          ✦ 3-day free trial
                        </span>
                        <span className="text-[10px] text-muted-foreground">then $19.99/mo</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <FeatureRow yes>Everything in Splits</FeatureRow>
                  <FeatureRow yes>Full Audio Studio</FeatureRow>
                  <FeatureRow yes>Waveform visualization</FeatureRow>
                  <FeatureRow yes>Kernel metrics &amp; PDF reports</FeatureRow>
                  <FeatureRow yes>Unlimited WAV downloads</FeatureRow>
                  <FeatureRow yes>Priority support</FeatureRow>
                </ul>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                {isCurrent("pro") ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-amber-500/10 text-amber-500 border-amber-500/20" data-testid="badge-pro-current">
                    Current Plan
                  </Badge>
                ) : isUpgrade("pro") ? (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    onClick={() => handleCheckout("pro", proBilling)}
                    disabled={loadingTier !== null}
                    data-testid="button-upgrade-pro"
                  >
                    {loadingTier === "pro"
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                      : proBilling === "monthly"
                        ? "Start Free Trial"
                        : "Get Pro Weekly"}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>Lower tier</Button>
                )}
                {proBilling === "monthly" && isUpgrade("pro") && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    No charge for 3 days — cancel any time before trial ends
                  </p>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* Node Auditor */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="flex flex-col h-full border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="text-lg">Node Auditor</CardTitle>
                <CardDescription>Enterprise scale benchmarking</CardDescription>
                <div className="mt-3">
                  <span className="text-3xl font-bold">$499</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <FeatureRow yes>Everything in Pro</FeatureRow>
                  <FeatureRow yes>Enterprise benchmarking</FeatureRow>
                  <FeatureRow yes>Custom reports</FeatureRow>
                  <FeatureRow yes>Dedicated support</FeatureRow>
                  <FeatureRow yes>SLA guarantee</FeatureRow>
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent("node_auditor") ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm" data-testid="badge-auditor-current">
                    Current Plan
                  </Badge>
                ) : isUpgrade("node_auditor") ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleCheckout("node_auditor")}
                    disabled={loadingTier !== null}
                    data-testid="button-upgrade-auditor"
                  >
                    {loadingTier === "node_auditor" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : "Subscribe"}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>Lower tier</Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>
        </div>

        {/* Promo Code Entry */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12 max-w-md mx-auto"
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
                onSubmit={(e) => {
                  e.preventDefault();
                  setPromoError(false);
                  const ok = redeemPromo(promoInput);
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
