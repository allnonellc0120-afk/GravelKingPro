import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Mail, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Pricing() {
  const { isPro, setIsPro } = useAppState();
  const { toast } = useToast();
  const [location] = useLocation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");

    if (checkout === "success" && sessionId) {
      fetch(`/api/stripe/subscription-status?session_id=${sessionId}`)
        .then(r => r.json())
        .then((data: any) => {
          if (data.active) {
            setIsPro(true);
            toast({ title: "You're now Pro!", description: "All features unlocked. Welcome to GravelKing Pro." });
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", "/pricing");
    } else if (checkout === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charge was made.", variant: "destructive" });
      window.history.replaceState({}, "", "/pricing");
    }

    // Also check on landing page return
    const rootParams = new URLSearchParams(window.location.search);
    if (rootParams.get("checkout") === "success") {
      const sid = rootParams.get("session_id");
      if (sid) {
        fetch(`/api/stripe/subscription-status?session_id=${sid}`)
          .then(r => r.json())
          .then((data: any) => { if (data.active) setIsPro(true); })
          .catch(() => {});
      }
    }
  }, []);

  const handleStripeCheckout = async (tier: "pro" | "node_auditor") => {
    setLoadingTier(tier);
    try {
      // Fetch products to get the right price ID
      const productsRes = await fetch("/api/stripe/products");
      const { data: products } = await productsRes.json() as { data: any[] };

      const tierName = tier === "pro" ? "GravelKing Pro" : "Node Auditor";
      const product = products.find((p: any) => p.name === tierName);

      if (!product || !product.prices?.length) {
        toast({
          title: "Products not configured yet",
          description: "Run the seed script to create Stripe products, then try again.",
          variant: "destructive",
        });
        setLoadingTier(null);
        return;
      }

      const priceId = product.prices[0].id;
      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const handleContactSales = () => {
    toast({
      title: "Sales team contacted",
      description: "A representative will reach out to you shortly.",
    });
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Pricing Plans</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose the right level of analysis power for your needs. Simple, transparent pricing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Starter Plan */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="flex flex-col h-full border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="text-xl">Starter</CardTitle>
                <CardDescription>Perfect for basic testing</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">Free</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Basic analysis</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Server-side processing</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Audio preview</li>
                </ul>
              </CardContent>
              <CardFooter>
                {!isPro ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-secondary/50" data-testid="badge-current-plan">
                    Current Plan
                  </Badge>
                ) : (
                  <Button variant="outline" className="w-full" disabled data-testid="button-starter-downgrade">
                    Downgrade
                  </Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* Pro Plan */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="flex flex-col h-full border-amber-500/30 bg-card/60 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                POPULAR
              </div>
              <CardHeader>
                <CardTitle className="text-xl text-amber-500">Pro</CardTitle>
                <CardDescription>For serious audio professionals</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$39.99</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-amber-500" /> Full real-time metrics</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-amber-500" /> Unlimited runs</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-amber-500" /> WAV download</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-amber-500" /> Detailed PDF reports</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-amber-500" /> Priority support</li>
                </ul>
              </CardContent>
              <CardFooter>
                {isPro ? (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm bg-amber-500/10 text-amber-500 border-amber-500/20" data-testid="badge-pro-current">
                    Current Plan
                  </Badge>
                ) : (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    onClick={() => handleStripeCheckout("pro")}
                    disabled={loadingTier !== null}
                    data-testid="button-upgrade-pro"
                  >
                    {loadingTier === "pro" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : "Upgrade to Pro"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* Node Auditor Plan */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="flex flex-col h-full border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="text-xl">Node Auditor</CardTitle>
                <CardDescription>Enterprise scale benchmarking</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$499</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-500" /> Everything in Pro</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-500" /> Enterprise benchmarking</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-500" /> Custom reports</li>
                  <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-500" /> Dedicated support</li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleStripeCheckout("node_auditor")}
                  disabled={loadingTier !== null}
                  data-testid="button-contact-sales"
                >
                  {loadingTier === "node_auditor" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : <><Mail className="w-4 h-4 mr-2" />Subscribe</>}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
