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
import { requireAdmin } from "../lib/adminAuth";
import { sendGmail } from "../lib/gmail";
import type Stripe from "stripe";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const execFileAsync = promisify(execFile);

const WEEKEND_SPECIAL_PRICE_ID = "price_1TzNCQD1aprhezOsuHcySJVo";
const NOTIFY_EMAIL = process.env.WEEKEND_NOTIFY_EMAIL?.trim() || "allnonellc0120@gmail.com";
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
    const meta = paid.session.metadata ?? {};
    const masters = [1, 2, 3]
      .filter((slot) => meta[`master_${slot}_path`])
      .map((slot) => ({ slot, name: meta[`master_${slot}_name`] ?? `master-${slot}.wav` }));
    res.json({
      paid: true,
      submitted:
        meta.fulfillment_status === "files_submitted" || meta.fulfillment_status === "delivered",
      delivered: meta.fulfillment_status === "delivered",
      masters: meta.fulfillment_status === "delivered" ? masters : [],
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

    // Owner notification — fail-soft, never blocks the customer.
    const customerEmail = paid.session.customer_details?.email ?? "unknown";
    void sendGmail({
      to: NOTIFY_EMAIL,
      subject: `New weekend mastering order — 3 tracks in (${customerEmail})`,
      text: [
        "A paid weekend-special order just submitted all three tracks.",
        "",
        `Customer: ${customerEmail}`,
        `Checkout session: ${sessionId}`,
        `Track 1: ${paid.session.metadata?.slot_1_name ?? "?"}`,
        `Track 2: ${paid.session.metadata?.slot_2_name ?? "?"}`,
        `Track 3: ${paid.session.metadata?.slot_3_name ?? "?"}`,
        "",
        "Review and deliver: https://gravelkingpro.it.com/admin/orders",
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
  if (!sessionId.startsWith("cs_") || !fulfillmentToken || ![1, 2, 3].includes(slot)) {
    res.status(400).json({ error: "Invalid download request" });
    return;
  }
  try {
    const paid = await getPaidOfferSession(sessionId, fulfillmentToken);
    if (!paid || paid.session.metadata?.fulfillment_status !== "delivered") {
      res.status(403).json({ error: "This order has no delivered masters yet." });
      return;
    }
    const path = paid.session.metadata?.[`master_${slot}_path`];
    if (!path) {
      res.status(404).json({ error: "Master not found for this slot." });
      return;
    }
    const name = paid.session.metadata?.[`master_${slot}_name`] ?? `master-${slot}.wav`;
    const url = await objectStorageService.getSignedDownloadURL(path, 3600, name);
    res.json({ url, name });
  } catch (error) {
    req.log.warn({ err: error }, "Weekend master download failed");
    res.status(500).json({ error: "Download is temporarily unavailable. Please retry." });
  }
});

// ── Admin: order management ──────────────────────────────────────────────────

async function getAdminOfferSession(sessionId: string) {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.offer !== OFFER_ID || session.payment_status !== "paid") {
    return null;
  }
  return { stripe, session };
}

function orderSummary(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};
  return {
    id: session.id,
    created: session.created,
    customerEmail: session.customer_details?.email ?? null,
    amountTotal: session.amount_total,
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

// List all paid weekend-special orders (newest first).
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
          orders.push(orderSummary(session));
        }
      }
      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data[batch.data.length - 1]?.id;
    }
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
    if (!sessionId.startsWith("cs_") || ![1, 2, 3].includes(slot)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      const order = await getAdminOfferSession(sessionId);
      const path = order?.session.metadata?.[`slot_${slot}_path`];
      if (!order || !path) {
        res.status(404).json({ error: "No upload found for this slot." });
        return;
      }
      const name = order.session.metadata?.[`slot_${slot}_name`] ?? `track-${slot}`;
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
      if (!sessionId.startsWith("cs_") || ![1, 2, 3].includes(slot) || !req.file) {
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
      await order.stripe.checkout.sessions.update(sessionId, {
        metadata: {
          ...order.session.metadata,
          [`master_${slot}_path`]: objectPath,
          [`master_${slot}_name`]: req.file.originalname.slice(0, 300),
        },
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
    if (!sessionId.startsWith("cs_")) {
      res.status(400).json({ error: "Invalid order" });
      return;
    }
    try {
      const order = await getAdminOfferSession(sessionId);
      if (!order) {
        res.status(404).json({ error: "Paid weekend-special order not found." });
        return;
      }
      const meta = order.session.metadata ?? {};
      const missing = [1, 2, 3].filter((slot) => !meta[`master_${slot}_path`]);
      if (missing.length > 0) {
        res.status(400).json({
          error: `Attach a finished master for slot${missing.length > 1 ? "s" : ""} ${missing.join(", ")} first.`,
        });
        return;
      }
      const customerEmail = order.session.customer_details?.email;
      if (!customerEmail) {
        res.status(400).json({ error: "This order has no customer email on file." });
        return;
      }

      const deliveryLink = `https://gravelkingpro.it.com/weekend-special?session_id=${encodeURIComponent(
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
          "Each track includes one revision; just reply to this email if you'd like adjustments.",
          "",
          "— GravelKing Pro",
        ].join("\n"),
      });

      await order.stripe.checkout.sessions.update(sessionId, {
        metadata: {
          ...meta,
          fulfillment_status: "delivered",
          delivered_at: new Date().toISOString(),
        },
      });
      req.log.info({ checkoutSessionId: sessionId, emailed }, "Weekend order delivered");
      res.json({ success: true, emailed, deliveryLink });
    } catch (error) {
      req.log.error({ err: error }, "Weekend admin delivery failed");
      res.status(500).json({ error: "Could not mark the order delivered." });
    }
  },
);

export default router;