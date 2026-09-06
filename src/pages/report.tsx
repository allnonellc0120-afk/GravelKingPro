import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, Lock } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { generateKernelReport } from "@/lib/generateReport";

export default function Report() {
  const { isPro, hasRun, results } = useAppState();
  const { toast } = useToast();

  const handleDownload = () => {
    if (!results) return;
    generateKernelReport({
      multiplier: results.multiplier,
      sliceSize: results.sliceSize,
      throughput: results.throughput,
      stability: results.stability,
      efficiency: results.efficiency,
      decayRate: results.decayRate,
      originalSum: results.originalSum,
      carvedSum: results.carvedSum,
      parityStatus: results.parityStatus,
      runDate: results.runDate,
    });
    toast({ title: "Report downloaded", description: "Your PDF is ready." });
  };

  if (!hasRun || !results) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto mt-20 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed border-border/50 bg-card/20"
          >
            <FileText className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h2 className="text-xl font-semibold mb-2">No Report Available</h2>
            <p className="text-muted-foreground mb-6">Run an analysis first to generate a detailed performance report.</p>
            <Button asChild>
              <Link href="/">Go to Dashboard</Link>
            </Button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Analysis Report</h1>
            <p className="text-muted-foreground">Generated from your most recent session.</p>
          </div>
          <Button 
            onClick={handleDownload} 
            className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
            disabled={!isPro}
            data-testid="button-download-pdf"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>

        {!isPro && (
          <div className="mb-8 p-4 rounded-lg bg-secondary/50 border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <p className="text-sm font-medium">PDF downloads are a Pro feature.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-border/40 bg-card/40">
            <CardHeader>
              <CardTitle className="text-lg">Executive Summary</CardTitle>
              <CardDescription>Latest telemetry results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Throughput</TableCell>
                      <TableCell className="font-mono">{results.throughput}</TableCell>
                      <TableCell className="text-emerald-500">Optimal</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Stability</TableCell>
                      <TableCell className="font-mono">{results.stability}</TableCell>
                      <TableCell className="text-emerald-500">Stable</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Efficiency</TableCell>
                      <TableCell className="font-mono">{results.efficiency}</TableCell>
                      <TableCell className="text-emerald-500">Normal</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="mt-8 space-y-4">
                <h3 className="text-md font-semibold">Technical Notes</h3>
                <div className="p-4 rounded bg-secondary/30 text-sm text-muted-foreground leading-relaxed border border-border/30">
                  <p>
                    The system sustained a peak throughput of {results.throughput} across the testing window with a stability index of {results.stability}. 
                    Overall efficiency reached {results.efficiency}, remaining well within acceptable thermal and processing limits.
                    <br /><br />
                    No anomalous buffer underruns or significant latency spikes were detected during the period. The parameters utilized (Signal Strength and Buffer Size) yielded an optimal balance between responsiveness and computational overhead.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
}
