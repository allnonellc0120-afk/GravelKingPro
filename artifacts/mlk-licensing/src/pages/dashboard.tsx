import { Layout } from "@/components/layout";
import { useGetMlkDashboard, getGetMlkDashboardQueryKey } from "@workspace/api-client-react";
import { Loader2, Download, Shield, Clock, HardDrive, BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetMlkDashboard({ query: { queryKey: getGetMlkDashboardQueryKey() } });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!dashboard || !dashboard.active) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-20 text-center">
          <Shield className="w-16 h-16 mx-auto mb-6 text-muted-foreground opacity-50" />
          <h1 className="text-3xl font-bold uppercase mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-8">
            You must have an active license to view the telemetry dashboard.
          </p>
          <Link href="/activate" className="inline-flex h-12 items-center justify-center bg-primary px-8 font-medium text-primary-foreground uppercase tracking-wider hover:bg-primary/90 transition-colors">
            Activate License
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <div className="inline-flex items-center text-xs font-mono font-bold uppercase tracking-wider text-primary mb-2">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
              License Active: {dashboard.tier} TIER
            </div>
            <h1 className="text-3xl font-bold uppercase">Telemetry Dashboard</h1>
          </div>
          <button className="h-10 px-4 flex items-center border bg-card hover:bg-accent hover:text-accent-foreground transition-colors font-mono text-sm uppercase">
            <Download className="w-4 h-4 mr-2" />
            Export Report (.csv)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="border p-6 bg-card flex flex-col justify-between">
            <div className="text-xs uppercase font-mono text-muted-foreground mb-2 flex items-center">
              <Key className="w-3 h-3 mr-2" /> Key Status
            </div>
            <div className="font-mono text-sm font-bold truncate" title={dashboard.licenseKey || ""}>
              {dashboard.licenseKey ? `...${dashboard.licenseKey.slice(-8)}` : "N/A"}
            </div>
            {dashboard.expiresAt && (
              <div className="text-xs text-muted-foreground mt-2 font-mono">Exp: {new Date(dashboard.expiresAt).toLocaleDateString()}</div>
            )}
          </div>
          <div className="border p-6 bg-card flex flex-col justify-between">
            <div className="text-xs uppercase font-mono text-muted-foreground mb-2 flex items-center">
              <HardDrive className="w-3 h-3 mr-2" /> Total Executions
            </div>
            <div className="text-3xl font-mono font-bold data-value">{dashboard.totalRuns}</div>
          </div>
          <div className="border p-6 bg-card flex flex-col justify-between">
            <div className="text-xs uppercase font-mono text-muted-foreground mb-2 flex items-center">
              <BarChart3 className="w-3 h-3 mr-2" /> Peak Performance
            </div>
            <div className="text-3xl font-mono font-bold text-accent data-value">{dashboard.peakGflops.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-2 font-mono">GFLOPS</div>
          </div>
          <div className="border p-6 bg-card flex flex-col justify-between">
            <div className="text-xs uppercase font-mono text-muted-foreground mb-2 flex items-center">
              <Activity className="w-3 h-3 mr-2" /> Avg Performance
            </div>
            <div className="text-3xl font-mono font-bold data-value">{dashboard.avgGflops.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-2 font-mono">GFLOPS</div>
          </div>
        </div>

        <div className="border bg-card">
          <div className="border-b px-6 py-4 flex items-center justify-between bg-muted/30">
            <h2 className="font-bold uppercase text-sm">Recent Executions</h2>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase font-mono text-muted-foreground bg-muted/20 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 font-medium">Matrix Size</th>
                  <th className="px-6 py-3 font-medium text-right">Avg GFLOPS</th>
                  <th className="px-6 py-3 font-medium text-right">Peak GFLOPS</th>
                  <th className="px-6 py-3 font-medium text-center">Mode</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {dashboard.recentRuns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground italic">
                      No executions recorded yet.
                    </td>
                  </tr>
                ) : (
                  dashboard.recentRuns.map((run) => (
                    <tr key={run.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {new Date(run.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-bold">{run.matrixSize}²</td>
                      <td className="px-6 py-4 text-right data-value">{run.gflops.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-bold text-accent data-value">{run.peakGflops.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        {run.demo ? (
                          <span className="inline-block px-2 py-1 bg-amber-500/10 text-amber-600 text-[10px] font-bold">DEMO</span>
                        ) : (
                          <span className="inline-block px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold">FULL</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Needed to avoid import errors since these aren't exported from lucide directly above
import { Key, Activity } from "lucide-react";
