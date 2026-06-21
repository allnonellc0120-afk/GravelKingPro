import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { WebhookHandlers } from "./webhookHandlers";

const app: Express = express();

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
app.use(authMiddleware);

app.use("/api", router);

export default app;
