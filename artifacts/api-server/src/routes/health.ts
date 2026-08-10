import { Router, type IRouter } from "express";
import { performance } from "perf_hooks";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (req, res) => {
  // Server-side handler timing: measured from request arrival (stamped by the
  // first app middleware) so the dashboard can separate "browser → API round
  // trip" from "time the server actually spent". Falls back to ~0 when the
  // stamp is missing (direct router use in tests).
  const startedAt = (res.locals as { requestStartMs?: number }).requestStartMs ?? performance.now();
  const data = HealthCheckResponse.parse({ status: "ok" });
  const serverMs = performance.now() - startedAt;
  res.setHeader("Server-Timing", `app;dur=${serverMs.toFixed(2)}`);
  res.json({ ...data, serverMs: Math.round(serverMs * 100) / 100 });
});

export default router;
