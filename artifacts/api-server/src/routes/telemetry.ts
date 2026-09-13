import { Router, type Request, type Response } from "express";
import { rateLimit } from "../lib/rateLimiter";
import { resolveTelemetryClient } from "../lib/liveTelemetryConfig";
import {
  getTokenTelemetryLedgerSummary,
  readTokenTelemetryLedger,
} from "../middleware/tokenTracker";

const telemetryRouter = Router();
const DEFAULT_RECORD_LIMIT = 100;
const MAX_RECORD_LIMIT = 500;

function capabilityToken(req: Request): string {
  if (typeof req.query.token === "string") return req.query.token;
  const authorization = req.header("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function recordLimit(req: Request): number {
  const requested = Number(req.query.limit);
  if (!Number.isInteger(requested) || requested <= 0) return DEFAULT_RECORD_LIMIT;
  return Math.min(requested, MAX_RECORD_LIMIT);
}

telemetryRouter.get(
  "/telemetry/live",
  rateLimit({ windowMs: 60_000, max: 60 }),
  async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, private");
    const token = capabilityToken(req);
    if (!token.trim()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const client = resolveTelemetryClient(token);
    if (!client) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      // Both reads are explicitly scoped. Never call either helper without the
      // capability-mapped client ID from this route.
      const [summary, clientRecords] = await Promise.all([
        getTokenTelemetryLedgerSummary(client.clientId),
        readTokenTelemetryLedger(client.clientId),
      ]);
      const limit = recordLimit(req);
      res.json({
        clientId: client.clientId,
        generatedAt: new Date().toISOString(),
        summary,
        records: clientRecords.slice(-limit),
      });
    } catch (error) {
      req.log.error({ error }, "Live token telemetry read failed");
      res.status(500).json({ error: "Token telemetry is unavailable." });
    }
  },
);

export default telemetryRouter;