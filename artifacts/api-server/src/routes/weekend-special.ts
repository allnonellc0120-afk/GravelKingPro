import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { issueDownloadToken, verifyDownloadToken, deliveryExpired } from "../lib/downloadGate";
import { execFile } from "child_process";
import { promisify } from "util";
import { unlink } from "fs/promises";
import { ObjectStorageService } from "../lib/objectStorage";
import { getUncachableStripeClient } from "../stripeClient";
import { recordAnalyticsEvent } from "../analytics";
import { rateLimit } from "../lib/rateLimiter";
import { requireAdmin } from "../lib/adminAuth";
import { sendGmail } from "../lib/gmail";
import type Stripe from "stripe";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const execFileAsync = promisify(execFile);

const WEEKEND_SPECIAL_PRICE_ID = "price_1TzNCQD1aprhezOsuHcySJVo";
const NOTIFY_EMAIL = process.env.WEEKEND_NOTIFY_EMAIL?.trim() || "allnonellc0120@gmail.com";
const OFFER_ID = "weekend_3_master_999";
// Download-gate helpers (7-day delivery window + short-lived HMAC token) live
// in lib/downloadGate so they are unit-testable without route side effects.
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

/**
 * A paid weekend-special order, normalized over the two Stripe objects we
 * accept: legacy hosted Checkout Sessions (cs_…) and embedded PaymentIntents
 * (pi_…). All order state lives in the object's metadata either way.
 */
interface PaidOrder {
  stripe: Stripe;
  id: string;
  created: number;
  amountTotal: number | null;
  email: string | null;
  metadata: Stripe.Metadata;
  update: (metadata: Stripe.Metadata) => Promise<void>;
}

function orderFromSession(stripe: Stripe, session: Stripe.Checkout.Session): PaidOrder {
  return {
    stripe,
    id: session.id,
    created: session.created,
    amountTotal: session.amount_total,
    email: session.customer_details?.email ?? null,
    metadata: session.metadata ?? {},
    update: async (metadata) => {
      await stripe.checkout.sessions.update(session.id, { metadata });
      if (typeof session.payment_intent === "string") {
        await stripe.paymentIntents.update(session.payment_intent, { metadata }).catch(() => null);
      }
    },
  };
}

function orderFromIntent(stripe: Stripe, intent: Stripe.PaymentIntent): PaidOrder {
  const charge = typeof intent.latest_charge === "object" && intent.latest_charge
    ? intent.latest_charge as Stripe.Charge
    : null;
  return {
    stripe,
    id: intent.id,
    created: intent.created,
    amountTotal: intent.amount,
    email: intent.metadata?.customer_email || intent.receipt_email || charge?.billing_details?.email || null,
    metadata: intent.metadata ?? {},
    update: async (metadata) => {
      await stripe.paymentIntents.update(intent.id, { metadata });
    },
  };
}

async function getPaidOfferSession(sessionId: string, fulfillmentToken: string): Promise<PaidOrder | null> {
  const stripe = await getUncachableStripeClient();
  if (sessionId.startsWith("pi_")) {
    const intent = await stripe.paymentIntents.retrieve(sessionId, { expand: ["latest_charge"] });
    if (
      intent.status !== "succeeded" ||
      intent.metadata?.offer !== OFFER_ID ||
      !fulfillmentToken ||
      intent.metadata?.fulfillment_token !== fulfillmentToken
    ) {
      return null;
    }
    return orderFromIntent(stripe, intent);
  }
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
  return orderFromSession(stripe, session);
}

/**
 * POST /api/weekend-special/payment-intent — embedded-checkout variant.
 * Returns a PaymentIntent client secret so the buyer pays in-app (card /
 * Apple Pay / Google Pay) and lands directly on the upload step. The buyer's
 * email is captured up front because delivery updates are sent there.
 */
router.post("/weekend-special/payment-intent", async (req: Request, res: Response): Promise<void> => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ error: "Enter a valid email — your masters and receipt are delivered there." });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(WEEKEND_SPECIAL_PRICE_ID);
    const amount = price.unit_amount ?? 999;
    const fulfillmentToken = randomUUID();

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: price.currency ?? "usd",
      automatic_payment_methods: { enabled: true },
      receipt_email: email,
      description: "Weekend Special — 3 songs mastered",
      metadata: {
        offer: OFFER_ID,
        fulfillment_status: "awaiting_uploads",
        fulfillment_token: fulfillmentToken,
        customer_email: email.slice(0, 200),
      },
    });
    if (!intent.client_secret) {
      res.status(502).json({ error: "Checkout is temporarily unavailable. Please try again." });
      return;
    }

    const visitorId = (req.cookies as Record<string, string>)?.gk_vid ?? null;
    void recordAnalyticsEvent({
      type: "checkout_started",
      visitorId,
      sessionId: intent.id,
      path: "/weekend-special",
      metadata: { priceId: WEEKEND_SPECIAL_PRICE_ID, offer: OFFER_ID, embedded: "true" },
    }).catch(() => {});

    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      fulfillmentToken,
    });
  } catch (error) {
    req.log.error({ err: error }, "Weekend special payment-intent failed");
    res.status(500).json({ error: "Checkout is temporarily unavailable. Please try again." });
  }
});

/**
 * POST /api/weekend-special/checkout
 * DEPRECATED: hosted-checkout fallback kept for older app versions; the web
 * client uses /payment-intent above.
 */

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
  if ((!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) || !fulfillmentToken) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }

  try {
    const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
    if (!paid) {
      res.status(403).json({ error: "Payment has not been confirmed" });
      return;
    }
    const meta = paid.metadata;
    const masters = [1, 2, 3]
      .filter((slot) => meta[`master_${slot}_path`])
      .map((slot) => ({ slot, name: meta[`master_${slot}_name`] ?? `master-${slot}.wav` }));
    const delivered = meta.fulfillment_status === "delivered";
    const downloadExpired = delivered && deliveryExpired(meta);
    res.json({
      paid: true,
      submitted: meta.fulfillment_status === "files_submitted" || delivered,
      delivered,
      downloadExpired,
      masters: delivered && !downloadExpired ? masters : [],
      downloadToken: delivered && !downloadExpired ? issueDownloadToken(sessionId) : null,
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
    if ((!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) || !fulfillmentToken) {
      res.status(403).json({ error: "A confirmed paid order is required before uploading." });
      return;
    }
    try {
      const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
      if (!paid || paid.metadata?.fulfillment_status === "files_submitted") {
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

      const paid = res.locals.weekendOrder as PaidOrder | null;
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
      await paid.update({
        ...paid.metadata,
        [`slot_${index + 1}_path`]: objectPath,
        [`slot_${index + 1}_name`]: req.file.originalname.slice(0, 300),
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
    if (paid.metadata?.fulfillment_status === "files_submitted") {
      res.status(409).json({ error: "This order was already submitted." });
      return;
    }

    const safeFiles = files as Array<{ objectPath: string }>;
    const expectedPaths = [1, 2, 3].map((slot) => paid.metadata?.[`slot_${slot}_path`]);
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
      ...paid.metadata,
      fulfillment_status: "files_submitted",
      submitted_at: new Date().toISOString(),
      track_1: `${paid.metadata?.slot_1_name}|${safeFiles[0].objectPath}`.slice(0, 500),
      track_2: `${paid.metadata?.slot_2_name}|${safeFiles[1].objectPath}`.slice(0, 500),
      track_3: `${paid.metadata?.slot_3_name}|${safeFiles[2].objectPath}`.slice(0, 500),
    };
    await paid.update(metadata);

    req.log.info({ checkoutSessionId: sessionId }, "Weekend mastering order files submitted");

    // Owner notification — fail-soft, never blocks the customer.
    const customerEmail = paid.email ?? "unknown";
    void sendGmail({
      to: NOTIFY_EMAIL,
      subject: `New weekend mastering order — 3 tracks in (${customerEmail})`,
      text: [
        "A paid weekend-special order just submitted all three tracks.",
        "",
        `Customer: ${customerEmail}`,
        `Order: ${sessionId}`,
        `Track 1: ${paid.metadata?.slot_1_name ?? "?"}`,
        `Track 2: ${paid.metadata?.slot_2_name ?? "?"}`,
        `Track 3: ${paid.metadata?.slot_3_name ?? "?"}`,
        "",
        "Review and deliver: https://gravelkingpro.com/admin/orders",
      ].join("\n"),
    }).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Weekend special submission failed");
    res.status(500).json({ error: "We could not finalize the order. Please retry." });
  }
});

// ── Customer: download a delivered master (short-lived signed URL) ───────────
router.get("/weekend-special/master", async (req: Request, res: Response): Promise<void> => {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
  const fulfillmentToken =
    typeof req.query.fulfillment_token === "string" ? req.query.fulfillment_token : "";
  const slot = Number(req.query.slot);
  const downloadToken =
    typeof req.query.download_token === "string" ? req.query.download_token : "";
  if ((!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) || !fulfillmentToken || ![1, 2, 3].includes(slot)) {
    res.status(400).json({ error: "Invalid download request" });
    return;
  }
  if (!downloadToken || !verifyDownloadToken(sessionId, downloadToken)) {
    res.status(403).json({ error: "This download link has expired. Reload your order page to get a fresh one." });
    return;
  }
  try {
    const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
    if (!paid || paid.metadata?.fulfillment_status !== "delivered") {
      res.status(403).json({ error: "This order has no delivered masters yet." });
      return;
    }
    if (deliveryExpired(paid.metadata ?? {})) {
      res.status(410).json({ error: "Downloads for this order expired 7 days after delivery. Contact support if you need your masters re-sent." });
      return;
    }
    const path = paid.metadata?.[`master_${slot}_path`];
    if (!path) {
      res.status(404).json({ error: "Master not found for this slot." });
      return;
    }
    const name = paid.metadata?.[`master_${slot}_name`] ?? `master-${slot}.wav`;
    const url = await objectStorageService.getSignedDownloadURL(path, 3600, name);
    res.json({ url, name });
  } catch (error) {
    req.log.warn({ err: error }, "Weekend master download failed");
    res.status(500).json({ error: "Download is temporarily unavailable. Please retry." });
  }
});

// ── Admin: order management ──────────────────────────────────────────────────

async function getAdminOfferSession(sessionId: string): Promise<PaidOrder | null> {
  const stripe = await getUncachableStripeClient();
  if (sessionId.startsWith("pi_")) {
    const intent = await stripe.paymentIntents.retrieve(sessionId, { expand: ["latest_charge"] });
    if (intent.metadata?.offer !== OFFER_ID || intent.status !== "succeeded") {
      return null;
    }
    return orderFromIntent(stripe, intent);
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.offer !== OFFER_ID || session.payment_status !== "paid") {
    return null;
  }
  return orderFromSession(stripe, session);
}

function orderSummary(order: PaidOrder) {
  const meta = order.metadata ?? {};
  return {
    id: order.id,
    created: order.created,
    customerEmail: order.email,
    amountTotal: order.amountTotal,
    status: meta.fulfillment_status ?? "awaiting_uploads",
    submittedAt: meta.submitted_at ?? null,
    deliveredAt: meta.delivered_at ?? null,
    tracks: [1, 2, 3].map((slot) => ({
      slot,
      name: meta[`slot_${slot}_name`] ?? null,
      uploaded: Boolean(meta[`slot_${slot}_path`]),
    })),
    masters: [1, 2, 3].map((slot) => ({
      slot,
      name: meta[`master_${slot}_name`] ?? null,
      uploaded: Boolean(meta[`master_${slot}_path`]),
    })),
  };
}

// List all paid weekend-special orders (newest first) — both legacy hosted
// checkout sessions and embedded payment intents.
router.get("/weekend-special/admin/orders", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const stripe = await getUncachableStripeClient();
    const orders: ReturnType<typeof orderSummary>[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const batch = await stripe.checkout.sessions.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const session of batch.data) {
        if (session.metadata?.offer === OFFER_ID && session.payment_status === "paid") {
          orders.push(orderSummary(orderFromSession(stripe, session)));
        }
      }
      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data[batch.data.length - 1]?.id;
    }
    startingAfter = undefined;
    for (let page = 0; page < 10; page += 1) {
      const batch = await stripe.paymentIntents.list({
        limit: 100,
        expand: ["data.latest_charge"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const intent of batch.data) {
        if (intent.metadata?.offer === OFFER_ID && intent.status === "succeeded") {
          orders.push(orderSummary(orderFromIntent(stripe, intent)));
        }
      }
      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data[batch.data.length - 1]?.id;
    }
    orders.sort((a, b) => b.created - a.created);
    res.json({ orders });
  } catch (error) {
    req.log.error({ err: error }, "Weekend admin order list failed");
    res.status(500).json({ error: "Could not load orders from Stripe." });
  }
});

// Signed URL for a customer's SOURCE upload.
router.get(
  "/weekend-special/admin/orders/:sessionId/source/:slot",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    const sessionId = String(req.params.sessionId ?? "");
    const slot = Number(req.params.slot);
    if ((!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) || ![1, 2, 3].includes(slot)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      const order = await getAdminOfferSession(sessionId);
      const path = order?.metadata?.[`slot_${slot}_path`];
      if (!order || !path) {
        res.status(404).json({ error: "No upload found for this slot." });
        return;
      }
      const name = order.metadata?.[`slot_${slot}_name`] ?? `track-${slot}`;
      const url = await objectStorageService.getSignedDownloadURL(path, 3600, name);
      res.json({ url, name });
    } catch (error) {
      req.log.error({ err: error }, "Weekend admin source download failed");
      res.status(500).json({ error: "Could not create a download link." });
    }
  },
);

// Attach a finished master to an order slot.
router.post(
  "/weekend-special/admin/orders/:sessionId/master/:slot",
  async (req: Request, res: Response, next): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    next();
  },
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const localPath = req.file?.path;
    try {
      const sessionId = String(req.params.sessionId ?? "");
      const slot = Number(req.params.slot);
      if ((!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) || ![1, 2, 3].includes(slot) || !req.file) {
        res.status(400).json({ error: "A valid order, slot (1-3), and audio file are required." });
        return;
      }
      if (!ACCEPTED_EXTENSIONS.test(req.file.originalname)) {
        res.status(400).json({ error: "Choose a WAV, MP3, AIFF, FLAC, or M4A audio file." });
        return;
      }
      const order = await getAdminOfferSession(sessionId);
      if (!order) {
        res.status(404).json({ error: "Paid weekend-special order not found." });
        return;
      }
      const objectPath = await objectStorageService.uploadPrivateFile(
        `weekend-orders/${sessionId}/master-${slot}`,
        req.file.path,
        req.file.mimetype || "application/octet-stream",
        {
          checkout_session: sessionId,
          slot: String(slot),
          kind: "master",
          original_name: req.file.originalname.slice(0, 200),
        },
      );
      await order.update({
        ...order.metadata,
        [`master_${slot}_path`]: objectPath,
        [`master_${slot}_name`]: req.file.originalname.slice(0, 300),
      });
      res.json({ objectPath, name: req.file.originalname, slot });
    } catch (error) {
      req.log.error({ err: error }, "Weekend admin master upload failed");
      res.status(500).json({ error: "Could not store the master file." });
    } finally {
      if (localPath) void unlink(localPath).catch(() => {});
    }
  },
);

// Mark the order delivered and email the customer their secure download link.
router.post(
  "/weekend-special/admin/orders/:sessionId/deliver",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    const sessionId = String(req.params.sessionId ?? "");
    if (!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) {
      res.status(400).json({ error: "Invalid order" });
      return;
    }
    try {
      const order = await getAdminOfferSession(sessionId);
      if (!order) {
        res.status(404).json({ error: "Paid weekend-special order not found." });
        return;
      }
      const meta = order.metadata ?? {};
      const missing = [1, 2, 3].filter((slot) => !meta[`master_${slot}_path`]);
      if (missing.length > 0) {
        res.status(400).json({
          error: `Attach a finished master for slot${missing.length > 1 ? "s" : ""} ${missing.join(", ")} first.`,
        });
        return;
      }
      const customerEmail = order.email;
      if (!customerEmail) {
        res.status(400).json({ error: "This order has no customer email on file." });
        return;
      }

      const deliveryLink = `https://gravelkingpro.com/weekend-special?session_id=${encodeURIComponent(
        sessionId,
      )}&fulfillment_token=${encodeURIComponent(meta.fulfillment_token ?? "")}`;
      const emailed = await sendGmail({
        to: customerEmail,
        subject: "Your 3 mastered tracks are ready — GravelKing Pro",
        text: [
          "Your weekend-special mastering order is complete!",
          "",
          "All three finished masters are ready to download from your private order page:",
          deliveryLink,
          "",
          "The download links on that page are unique to your order — please don't share them.",
          "For security, downloads are available for 7 days after delivery, so grab your files soon.",
          "Each track includes one revision; just reply to this email if you'd like adjustments.",
          "",
          "— GravelKing Pro",
        ].join("\n"),
      });

      await order.update({
        ...meta,
        fulfillment_status: "delivered",
        delivered_at: new Date().toISOString(),
      });
      req.log.info({ checkoutSessionId: sessionId, emailed }, "Weekend order delivered");
      res.json({ success: true, emailed, deliveryLink });
    } catch (error) {
      req.log.error({ err: error }, "Weekend admin delivery failed");
      res.status(500).json({ error: "Could not mark the order delivered." });
    }
  },
);

// Re-open downloads on a delivered order: refresh delivered_at (restarting the
// 7-day window) and re-email the customer their order link.
router.post(
  "/weekend-special/admin/orders/:sessionId/resend",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    const sessionId = String(req.params.sessionId ?? "");
    if (!sessionId.startsWith("cs_") && !sessionId.startsWith("pi_")) {
      res.status(400).json({ error: "Invalid order" });
      return;
    }
    try {
      const order = await getAdminOfferSession(sessionId);
      if (!order) {
        res.status(404).json({ error: "Paid weekend-special order not found." });
        return;
      }
      const meta = order.metadata ?? {};
      if (meta.fulfillment_status !== "delivered") {
        res.status(400).json({ error: "Only delivered orders can have their download link re-sent." });
        return;
      }
      const customerEmail = order.email;
      if (!customerEmail) {
        res.status(400).json({ error: "This order has no customer email on file." });
        return;
      }

      const deliveryLink = `https://gravelkingpro.com/weekend-special?session_id=${encodeURIComponent(
        sessionId,
      )}&fulfillment_token=${encodeURIComponent(meta.fulfillment_token ?? "")}`;
      const emailed = await sendGmail({
        to: customerEmail,
        subject: "Your download link has been refreshed — GravelKing Pro",
        text: [
          "Good news — we've re-opened the downloads for your mastering order.",
          "",
          "All three finished masters are ready to download from your private order page:",
          deliveryLink,
          "",
          "The download links on that page are unique to your order — please don't share them.",
          "For security, downloads are available for 7 days from now, so grab your files soon.",
          "",
          "— GravelKing Pro",
        ].join("\n"),
      });

      await order.update({
        ...meta,
        fulfillment_status: "delivered",
        delivered_at: new Date().toISOString(),
      });
      req.log.info({ checkoutSessionId: sessionId, emailed }, "Weekend order download link re-sent");
      res.json({ success: true, emailed, deliveryLink });
    } catch (error) {
      req.log.error({ err: error }, "Weekend admin resend failed");
      res.status(500).json({ error: "Could not re-send the download link." });
    }
  },
);

export default router;