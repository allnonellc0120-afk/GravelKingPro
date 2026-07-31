import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { unlink } from "fs/promises";
import { ObjectStorageService } from "../lib/objectStorage";
import { getUncachableStripeClient } from "../stripeClient";
import { recordAnalyticsEvent } from "../analytics";
import { rateLimit } from "../lib/rateLimiter";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const execFileAsync = promisify(execFile);

const WEEKEND_SPECIAL_PRICE_ID = "price_1TzNCQD1aprhezOsuHcySJVo";
const OFFER_ID = "weekend_3_master_999";
const MAX_FILE_SIZE = 250 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = /\.(wav|mp3|aif|aiff|flac|m4a)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) =>
      cb(null, `gk_weekend_${randomUUID()}_${file.originalname.replace(/[^\w.-]/g, "_")}`),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});
const uploadRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  max: 12,
  message: "Too many upload attempts. Please wait a few minutes and retry.",
});

async function getPaidOfferSession(sessionId: string, fulfillmentToken: string) {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (
    session.payment_status !== "paid" ||
    session.mode !== "payment" ||
    session.metadata?.offer !== OFFER_ID ||
    !fulfillmentToken ||
    session.metadata?.fulfillment_token !== fulfillmentToken
  ) {
    return null;
  }
  return { stripe, session };
}

router.post("/weekend-special/checkout", async (req: Request, res: Response): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:80";
    const baseUrl = `https://${domain}`;
    const fulfillmentToken = randomUUID();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: WEEKEND_SPECIAL_PRICE_ID, quantity: 1 }],
      payment_method_types: ["card"],
      customer_creation: "always",
      billing_address_collection: "auto",
      success_url: `${baseUrl}/weekend-special?session_id={CHECKOUT_SESSION_ID}&fulfillment_token=${fulfillmentToken}`,
      cancel_url: `${baseUrl}/weekend-special?checkout=cancelled`,
      metadata: {
        offer: OFFER_ID,
        fulfillment_status: "awaiting_uploads",
        fulfillment_token: fulfillmentToken,
      },
      payment_intent_data: { metadata: { offer: OFFER_ID } },
    });

    const visitorId = (req.cookies as Record<string, string>)?.gk_vid ?? null;
    void recordAnalyticsEvent({
      type: "checkout_started",
      visitorId,
      sessionId: session.id,
      path: "/weekend-special",
      metadata: { priceId: WEEKEND_SPECIAL_PRICE_ID, offer: OFFER_ID },
    }).catch(() => {});

    res.json({ url: session.url });
  } catch (error) {
    req.log.error({ err: error }, "Weekend special checkout failed");
    res.status(500).json({ error: "Checkout is temporarily unavailable. Please try again." });
  }
});

router.get("/weekend-special/order", async (req: Request, res: Response): Promise<void> => {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
  const fulfillmentToken =
    typeof req.query.fulfillment_token === "string" ? req.query.fulfillment_token : "";
  if (!sessionId.startsWith("cs_") || !fulfillmentToken) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }

  try {
    const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
    if (!paid) {
      res.status(403).json({ error: "Payment has not been confirmed" });
      return;
    }
    res.json({
      paid: true,
      submitted: paid.session.metadata?.fulfillment_status === "files_submitted",
    });
  } catch (error) {
    req.log.warn({ err: error }, "Weekend special order lookup failed");
    res.status(404).json({ error: "Order not found" });
  }
});

router.post(
  "/weekend-special/upload",
  uploadRateLimit,
  async (req: Request, res: Response, next): Promise<void> => {
    const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
    const fulfillmentToken =
      typeof req.query.fulfillment_token === "string" ? req.query.fulfillment_token : "";
    if (!sessionId.startsWith("cs_") || !fulfillmentToken) {
      res.status(403).json({ error: "A confirmed paid order is required before uploading." });
      return;
    }
    try {
      const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
      if (!paid || paid.session.metadata?.fulfillment_status === "files_submitted") {
        res.status(403).json({ error: "This order cannot accept more uploads." });
        return;
      }
      res.locals.weekendOrder = paid;
      res.locals.weekendSessionId = sessionId;
      next();
    } catch {
      res.status(403).json({ error: "A confirmed paid order is required before uploading." });
    }
  },
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const localPath = req.file?.path;
    try {
      const sessionId = res.locals.weekendSessionId as string;
      const index = Number(req.body.index);
      if (!req.file || ![0, 1, 2].includes(index)) {
        res.status(400).json({ error: "A valid paid order, track slot, and audio file are required." });
        return;
      }
      if (!ACCEPTED_EXTENSIONS.test(req.file.originalname)) {
        res.status(400).json({ error: "Choose a WAV, MP3, AIFF, FLAC, or M4A audio file." });
        return;
      }

      const paid = res.locals.weekendOrder as Awaited<ReturnType<typeof getPaidOfferSession>>;
      if (!paid) throw new Error("Missing verified order");

      await execFileAsync(
        "ffprobe",
        [
          "-v", "error",
          "-select_streams", "a:0",
          "-show_entries", "stream=codec_type",
          "-of", "default=noprint_wrappers=1:nokey=1",
          req.file.path,
        ],
        { timeout: 30_000 },
      );

      const objectPath = await objectStorageService.uploadPrivateFile(
        `weekend-orders/${sessionId}/track-${index + 1}`,
        req.file.path,
        req.file.mimetype || "application/octet-stream",
        {
          checkout_session: sessionId,
          slot: String(index + 1),
          original_name: req.file.originalname.slice(0, 200),
        },
      );
      await paid.stripe.checkout.sessions.update(sessionId, {
        metadata: {
          ...paid.session.metadata,
          [`slot_${index + 1}_path`]: objectPath,
          [`slot_${index + 1}_name`]: req.file.originalname.slice(0, 300),
        },
      });
      res.json({ objectPath, name: req.file.originalname });
    } catch (error) {
      req.log.warn({ err: error }, "Weekend special track upload rejected");
      res.status(400).json({ error: "That file could not be verified as supported audio." });
    } finally {
      if (localPath) void unlink(localPath).catch(() => {});
    }
  },
);

router.post("/weekend-special/submit", async (req: Request, res: Response): Promise<void> => {
  const { sessionId, fulfillmentToken, files } = req.body as {
    sessionId?: unknown;
    fulfillmentToken?: unknown;
    files?: unknown;
  };
  if (
    typeof sessionId !== "string" ||
    typeof fulfillmentToken !== "string" ||
    !Array.isArray(files) ||
    files.length !== 3 ||
    files.some(
      (file) =>
        typeof file !== "object" ||
        file === null ||
        typeof (file as { objectPath?: unknown }).objectPath !== "string" ||
        !(file as { objectPath: string }).objectPath.startsWith(
          `/objects/weekend-orders/${sessionId}/`,
        ),
    )
  ) {
    res.status(400).json({ error: "Exactly three completed uploads are required." });
    return;
  }

  try {
    const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
    if (!paid) {
      res.status(403).json({ error: "A confirmed payment is required." });
      return;
    }
    if (paid.session.metadata?.fulfillment_status === "files_submitted") {
      res.status(409).json({ error: "This order was already submitted." });
      return;
    }

    const safeFiles = files as Array<{ objectPath: string }>;
    const expectedPaths = [1, 2, 3].map((slot) => paid.session.metadata?.[`slot_${slot}_path`]);
    if (
      new Set(safeFiles.map((file) => file.objectPath)).size !== 3 ||
      safeFiles.some((file, index) => file.objectPath !== expectedPaths[index])
    ) {
      res.status(400).json({ error: "The submitted tracks do not match this order's upload slots." });
      return;
    }
    await Promise.all(
      safeFiles.map((file) => objectStorageService.getObjectEntityFile(file.objectPath)),
    );

    const metadata = {
      ...paid.session.metadata,
      fulfillment_status: "files_submitted",
      submitted_at: new Date().toISOString(),
      track_1: `${paid.session.metadata?.slot_1_name}|${safeFiles[0].objectPath}`.slice(0, 500),
      track_2: `${paid.session.metadata?.slot_2_name}|${safeFiles[1].objectPath}`.slice(0, 500),
      track_3: `${paid.session.metadata?.slot_3_name}|${safeFiles[2].objectPath}`.slice(0, 500),
    };
    await paid.stripe.checkout.sessions.update(sessionId, { metadata });
    if (typeof paid.session.payment_intent === "string") {
      await paid.stripe.paymentIntents.update(paid.session.payment_intent, { metadata });
    }

    req.log.info({ checkoutSessionId: sessionId }, "Weekend mastering order files submitted");
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Weekend special submission failed");
    res.status(500).json({ error: "We could not finalize the order. Please retry." });
  }
});

export default router;