import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { recoverStaleMasterJobs } from "./routes/master";
import { logger } from "./lib/logger";
import { loadAuthUser } from "./middlewares/authMiddleware";
import { maintenanceModeMiddleware } from "./middlewares/maintenanceMode";
import { WebhookHandlers } from "./webhookHandlers";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

// Log crashes before the process dies — helps diagnose production "Processing failed" with no log entry.
process.on("uncaughtException", (err) => logger.fatal({ err }, "uncaughtException"));
process.on("unhandledRejection", (reason) => logger.fatal({ reason }, "unhandledRejection"));

const app: Express = express();

// In-process mastering cannot resume once its /tmp input disappears at a
// restart. Recover stale records early so clients can retry instead of polling
// "running" forever. A not-yet-published schema must not prevent boot.
void recoverStaleMasterJobs().catch((err) => {
  logger.warn({ err }, "unable to recover stale mastering jobs");
});

// Stamp request arrival so routes can report true server-side handler time
// (health.ts serverMs, master.ts X-GK-Timing-* headers).
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.locals.requestStartMs = performance.now();
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk proxy MUST be mounted before body parsers — it streams raw bytes.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Webhook route MUST be registered before express.json() so the raw Buffer body is preserved
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, req);
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err }, "Webhook processing error");
      res.status(400).json({ error: message });
    }
  },
);

// Build an exact-match allowlist from REPLIT_DOMAINS (comma-separated in prod).
// Also include the Replit dev domain and Expo web preview domain for development.
// In development any localhost / 127.0.0.1 origin is also permitted.
const trustedOrigins: Set<string> = new Set(
  [
    ...(process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean).map(d => `https://${d}`),
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
    // Expo web preview: <id>.expo.<host> — derived from REPLIT_EXPO_DEV_DOMAIN
    process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : null,
  ].filter((d): d is string => typeof d === "string"),
);

app.use(
  cors({
    credentials: true,
    origin(requestOrigin, callback) {
      // Same-origin and server-to-server requests have no Origin header — allow.
      if (!requestOrigin) return callback(null, true);
      // Exact match against the allowlist.
      if (trustedOrigins.has(requestOrigin)) return callback(null, true);
      // Permit localhost in development only.
      if (
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin not allowed: ${requestOrigin}`));
    },
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk session validation — resolves the publishable key from the request host
// so the same server can handle multiple custom domains.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Load authenticated user into req.dbUser (optional — does not reject requests).
app.use(loadAuthUser);
app.use(maintenanceModeMiddleware);

app.use("/api", router);

// Global JSON error handler — MUST be last. Catches any error passed to next(err)
// (multer LIMIT_FILE_SIZE, CORS failures, unhandled route errors, etc.) and returns
// JSON instead of Express's default HTML page, which the client can't parse and
// shows as a generic "Processing failed" with no useful message.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode
    ?? 500;
  logger.error({ err }, "unhandled express error");
  if (!res.headersSent) {
    res.status(status).json({ success: false, error: err.message ?? "Internal server error" });
  }
});

export default app;
