import { Router } from "express";
import { spawn } from "child_process";
import { db } from "@workspace/db";
import {
  mlkInquiriesTable,
  mlkLicensesTable,
  mlkBenchmarkRunsTable,
} from "@workspace/db";
import { eq, desc, avg, max, count } from "drizzle-orm";
import {
  SubmitMlkInquiryBody,
  ActivateMlkLicenseBody,
  RunMlkBenchmarkBody,
} from "@workspace/api-zod";

const router = Router();

const MLK_PRODUCTS = [
  {
    id: "poc",
    tier: "poc" as const,
    name: "Proof of Concept",
    description: "Time-limited evaluation license for internal benchmarking and validation.",
    priceLabel: "$12,000 – $25,000 one-time",
    matrixSize: 4096,
    highlighted: false,
    features: [
      "4096×4096 DGEMM benchmark",
      "Full JSON metrics output",
      "NIST SP 800-223/234 audit log",
      "Single-node license",
      "Email support",
      "90-day term",
    ],
  },
  {
    id: "enterprise",
    tier: "enterprise" as const,
    name: "Annual Enterprise",
    description: "Full production license with priority support and updates included.",
    priceLabel: "$45,000 – $120,000 / year",
    matrixSize: 8192,
    highlighted: true,
    features: [
      "8192×8192 DGEMM benchmark",
      "Unlimited benchmark runs",
      "NUMA-aware + AVX-512 optimized",
      "Multi-node license",
      "Priority support (4h SLA)",
      "Annual updates included",
      "Custom matrix sizes",
      "PDF delivery report",
    ],
  },
  {
    id: "buyout",
    tier: "buyout" as const,
    name: "Full IP Buyout",
    description: "Complete intellectual property transfer. Perpetual license with negotiated terms.",
    priceLabel: "$75,000 – $150,000",
    matrixSize: 8192,
    highlighted: false,
    features: [
      "Full IP transfer",
      "Unlimited nodes",
      "Source code included",
      "Perpetual license",
      "12-month maintenance included",
      "Custom integration support",
      "NDA-protected negotiation",
    ],
  },
];

router.get("/mlk/products", (_req, res) => {
  res.json(MLK_PRODUCTS);
});

router.post("/mlk/inquiry", async (req, res) => {
  const parsed = SubmitMlkInquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const { name, email, company, tier, nodeCount, message } = parsed.data;
  const [row] = await db
    .insert(mlkInquiriesTable)
    .values({ name, email, company, tier, nodeCount: nodeCount ?? null, message: message ?? null })
    .returning({ id: mlkInquiriesTable.id });
  req.log.info({ id: row.id, company, tier }, "MLK inquiry received");
  res.status(201).json({ id: row.id, message: "Inquiry received. GravelKing Enterprises will be in touch within 1 business day." });
});

router.post("/mlk/license/activate", async (req, res) => {
  const parsed = ActivateMlkLicenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { licenseKey, email } = parsed.data;
  const [license] = await db
    .select()
    .from(mlkLicensesTable)
    .where(eq(mlkLicensesTable.licenseKey, licenseKey))
    .limit(1);

  if (!license || !license.active) {
    res.status(401).json({ error: "Invalid or inactive license key" });
    return;
  }
  if (license.email.toLowerCase() !== email.toLowerCase()) {
    res.status(401).json({ error: "License key does not match the provided email" });
    return;
  }
  if (license.expiresAt && license.expiresAt < new Date()) {
    res.status(401).json({ error: "License key has expired" });
    return;
  }

  const sessionId = (req.cookies as Record<string, string>)["mlk_session"] ?? licenseKey.slice(0, 16);
  await db
    .update(mlkLicensesTable)
    .set({ sessionId })
    .where(eq(mlkLicensesTable.licenseKey, licenseKey));

  res.cookie("mlk_session", sessionId, { httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.json({
    tier: license.tier,
    active: true,
    licenseKey: license.licenseKey,
    email: license.email,
    company: license.company,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    runsUsed: license.runsUsed,
  });
});

async function getSessionLicense(req: import("express").Request) {
  const sessionId = (req.cookies as Record<string, string>)["mlk_session"];
  if (!sessionId) return null;
  const [license] = await db
    .select()
    .from(mlkLicensesTable)
    .where(eq(mlkLicensesTable.sessionId, sessionId))
    .limit(1);
  if (!license || !license.active) return null;
  if (license.expiresAt && license.expiresAt < new Date()) return null;
  return license;
}

router.get("/mlk/license/status", async (req, res) => {
  const license = await getSessionLicense(req);
  if (!license) {
    res.json({ tier: "none", active: false, licenseKey: null, email: null, company: null, expiresAt: null, runsUsed: 0 });
    return;
  }
  res.json({
    tier: license.tier,
    active: true,
    licenseKey: license.licenseKey,
    email: license.email,
    company: license.company,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    runsUsed: license.runsUsed,
  });
});

function runBenchmarkProcess(matrixSize: number, iterations: number, licenseKey: string | null): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      MLK_MATRIX_SIZE: String(matrixSize),
      MLK_ITERATIONS: String(iterations),
    };
    if (licenseKey) {
      env.MLK_LICENSE_KEY = licenseKey;
    }

    const scriptPath = `${process.cwd()}/../../.local/mlk-repo/morris_law_kernel_v35_fast.py`;
    const proc = spawn("python3", [scriptPath], { env, timeout: 120_000 });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Benchmark process exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const lines = stdout.trim().split("\n");
        const jsonLine = [...lines].reverse().find((l: string) => l.startsWith("{")) ?? stdout.trim();
        resolve(JSON.parse(jsonLine));
      } catch {
        reject(new Error(`Could not parse benchmark output: ${stdout.slice(0, 300)}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

router.post("/mlk/benchmark/run", async (req, res) => {
  const parsed = RunMlkBenchmarkBody.safeParse(req.body);
  const { matrixSize: reqSize, iterations: reqIter } = parsed.success ? parsed.data : {};

  const license = await getSessionLicense(req);
  const demo = !license;

  const matrixSize = demo ? 512 : Math.min(reqSize ?? 4096, license?.tier === "poc" ? 4096 : 8192);
  const iterations = demo ? 3 : Math.min(reqIter ?? 8, 16);
  const sessionId = (req.cookies as Record<string, string>)["mlk_session"] ?? "anon";

  let result: Record<string, unknown>;
  try {
    result = await runBenchmarkProcess(matrixSize, iterations, license?.licenseKey ?? null);
  } catch (err) {
    req.log.error({ err }, "Benchmark process failed");
    res.status(503).json({ error: "Benchmark runner unavailable. Ensure Python + numpy/scipy are installed." });
    return;
  }

  const gflops = Number(result["gflops"] ?? result["avg_gflops"] ?? 0);
  const peakGflops = Number(result["peak_gflops"] ?? gflops);
  const minGflops = Number(result["min_gflops"] ?? gflops);
  const stdGflops = Number(result["std_gflops"] ?? 0);
  const avgTimeSec = Number(result["avg_time_sec"] ?? 0);
  const mmapLocked = Boolean(result["mmap_locked"] ?? false);
  const numaAware = Boolean(result["numa_aware"] ?? false);
  const blasBackend = String(result["blas_backend"] ?? "OpenBLAS");

  const [row] = await db.insert(mlkBenchmarkRunsTable).values({
    sessionId,
    licenseKey: license?.licenseKey ?? null,
    matrixSize,
    gflops,
    peakGflops,
    minGflops,
    stdGflops,
    avgTimeSec,
    mmapLocked,
    numaAware,
    blasBackend,
    licensed: !demo,
    demo,
  }).returning({ id: mlkBenchmarkRunsTable.id });

  if (license) {
    await db.update(mlkLicensesTable)
      .set({ runsUsed: license.runsUsed + 1 })
      .where(eq(mlkLicensesTable.id, license.id));
  }

  res.json({
    matrixSize,
    gflops,
    peakGflops,
    minGflops,
    stdGflops,
    avgTimeSec,
    mmapLocked,
    numaAware,
    blasBackend,
    kernel: "MLK-V 3.5 Fast",
    licensed: !demo,
    demo,
    consultingNote: demo
      ? null
      : "Delivered as part of GravelKing Enterprises HPC optimization services.",
    timestamp: new Date().toISOString(),
    _runId: row.id,
  });
});

router.get("/mlk/benchmark/history", async (req, res) => {
  const sessionId = (req.cookies as Record<string, string>)["mlk_session"] ?? "anon";
  const rows = await db
    .select()
    .from(mlkBenchmarkRunsTable)
    .where(eq(mlkBenchmarkRunsTable.sessionId, sessionId))
    .orderBy(desc(mlkBenchmarkRunsTable.createdAt))
    .limit(20);
  res.json(rows.map((r) => ({
    id: r.id,
    matrixSize: r.matrixSize,
    gflops: r.gflops,
    peakGflops: r.peakGflops,
    demo: r.demo,
    timestamp: r.createdAt.toISOString(),
  })));
});

router.get("/mlk/dashboard", async (req, res) => {
  const license = await getSessionLicense(req);
  const sessionId = (req.cookies as Record<string, string>)["mlk_session"] ?? "anon";

  const runs = await db
    .select()
    .from(mlkBenchmarkRunsTable)
    .where(eq(mlkBenchmarkRunsTable.sessionId, sessionId))
    .orderBy(desc(mlkBenchmarkRunsTable.createdAt))
    .limit(50);

  const totalRuns = runs.length;
  const peakGflops = runs.length ? Math.max(...runs.map((r) => r.peakGflops)) : 0;
  const avgGflops = runs.length ? runs.reduce((s, r) => s + r.gflops, 0) / runs.length : 0;

  res.json({
    tier: license?.tier ?? "none",
    active: !!license,
    licenseKey: license?.licenseKey ?? null,
    email: license?.email ?? null,
    company: license?.company ?? null,
    expiresAt: license?.expiresAt?.toISOString() ?? null,
    totalRuns,
    peakGflops,
    avgGflops,
    recentRuns: runs.slice(0, 10).map((r) => ({
      id: r.id,
      matrixSize: r.matrixSize,
      gflops: r.gflops,
      peakGflops: r.peakGflops,
      demo: r.demo,
      timestamp: r.createdAt.toISOString(),
    })),
  });
});

export default router;
