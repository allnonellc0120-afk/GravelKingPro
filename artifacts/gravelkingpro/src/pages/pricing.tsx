import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Pricing() {
  const { isPro, setIsPro } = useAppState();
  const { toast } = useToast();

  const handleUpgrade = () => {
    setIsPro(true);
    toast({
      title: "Upgraded to Pro",
      description: "You now have access to full metrics and reports.",
    });
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
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
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-500" /> Basic analysis
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-500" /> 1 core utilization
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-500" /> Standard report
                  </li>
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
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
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-amber-500" /> Full real-time metrics
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-amber-500" /> Unlimited runs
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-amber-500" /> Detailed PDF reports
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-amber-500" /> Priority support
                  </li>
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
                    onClick={handleUpgrade}
                    data-testid="button-upgrade-pro"
                  >
                    Upgrade to Pro
                  </Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>

          {/* Node Auditor Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
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
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-blue-500" /> Enterprise benchmarking
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-blue-500" /> 1T scale testing
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-blue-500" /> Morris Law V2 access
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-blue-500" /> Dedicated support
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-blue-500" /> Custom reports
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full" onClick={handleContactSales} data-testid="button-contact-sales">
                  <Mail className="w-4 h-4 mr-2" />
                  Contact Sales
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
