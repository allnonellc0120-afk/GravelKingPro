import { Router, type Request, type Response } from "express";
import { db, tracksTable, purchasedTracksTable, usersTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { resolveTier } from "../lib/entitlement";
import { objectStorageClient } from "../lib/objectStorage";
import { getUncachableStripeClient } from "../stripeClient";
import { storage } from "../storage";
import multer from "multer";
import { randomUUID } from "node:crypto";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}

async function saveFileToBucket(buffer: Buffer, key: string, contentType: string): Promise<void> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
  await objectStorageClient.bucket(bucketId).file(key).save(buffer, { contentType });
}

/** Derive gk_session-based userId. Returns null if no session cookie present. */
async function resolveSessionUser(req: Request): Promise<{ sessionId: string; userId: string } | null> {
  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (!sessionId) return null;
  const user = await storage.getUserBySession(sessionId);
  if (!user) return null;
  return { sessionId, userId: user.id };
}

/** GET /api/tracks — list all accepted tracks, newest first */
router.get("/tracks", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(tracksTable)
      .where(eq(tracksTable.status, "accepted"))
      .orderBy(desc(tracksTable.createdAt));
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

/** GET /api/tracks/artist/:artist — list accepted tracks by artist, newest first */
router.get("/tracks/artist/:artist", async (req: Request, res: Response) => {
  const artist = req.params.artist as string;
  try {
    const rows = await db
      .select()
      .from(tracksTable)
      .where(and(
        eq(tracksTable.artistName, artist),
        eq(tracksTable.status, "accepted"),
      ))
      .orderBy(desc(tracksTable.createdAt));
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

/** GET /api/library — tracks the user has purchased (gk_session-scoped, no auth wall) */
router.get("/library", async (req: Request, res: Response) => {
  const session = await resolveSessionUser(req);
  if (!session) {
    res.json({ tracks: [] });
    return;
  }

  try {
    const purchased = await db
      .select()
      .from(purchasedTracksTable)
      .where(eq(purchasedTracksTable.userId, session.userId));

    const trackIds = purchased.map(r => r.trackId);
    if (trackIds.length === 0) {
      res.json({ tracks: [] });
      return;
    }

    const tracks = await db
      .select()
      .from(tracksTable)
      .where(inArray(tracksTable.id, trackIds));

    res.json({ tracks });
  } catch (_err) {
    res.status(500).json({ error: "Failed to load library" });
  }
});

/**
 * POST /api/tracks/submit — submit a track via multipart file upload.
 * Requires any paid subscription tier (weekly, monthly, node_auditor).
 * Rate-limited to once per 7 days — except node_auditor which is unlimited.
 */
router.post(
  "/tracks/submit",
  upload.fields([
    { name: "audio_full", maxCount: 1 },
    { name: "audio_preview", maxCount: 1 },
    { name: "cover_art", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const sessionId = (req.cookies as Record<string, string>)?.gk_session;
    if (!sessionId) {
      res.status(403).json({ error: "A Pro subscription is required to submit tracks. Subscribe at /pricing." });
      return;
    }

    const tier = await resolveTier(req);
    if (tier === "free") {
      res.status(403).json({ error: "A Pro subscription is required to submit tracks. Subscribe at /pricing." });
      return;
    }

    const body = req.body as Record<string, string>;
    const title = body.title?.trim();
    const artistName = body.artistName?.trim();

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const audioFull = files?.audio_full?.[0];
    const audioPreview = files?.audio_preview?.[0];
    const coverArt = files?.cover_art?.[0];

    if (!title || !artistName || !audioFull || !audioPreview || !coverArt) {
      res.status(400).json({ error: "Missing required fields or files (audio_full, audio_preview, cover_art)" });
      return;
    }

    const user = await storage.getOrCreateUser(sessionId);
    const now = new Date();

    // node_auditor has unlimited submissions; all other paid tiers are rate-limited to once per 7 days
    if (tier !== "node_auditor") {
      const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
      const last = dbUser?.lastSubmissionDate;
      if (last && (now.getTime() - new Date(last).getTime()) < SEVEN_DAYS_MS) {
        const daysLeft = Math.ceil((SEVEN_DAYS_MS - (now.getTime() - new Date(last).getTime())) / (24 * 60 * 60 * 1000));
        res.status(429).json({ error: `Track submissions are limited to once per 7 days. Try again in ${daysLeft} day(s).` });
        return;
      }
    }

    try {
      const id = randomUUID();
      const audioFullKey = `tracks/${id}/audio_full${extOf(audioFull.originalname)}`;
      const audioPreviewKey = `tracks/${id}/audio_preview${extOf(audioPreview.originalname)}`;
      const coverArtKey = `tracks/${id}/cover_art${extOf(coverArt.originalname)}`;

      await Promise.all([
        saveFileToBucket(audioFull.buffer, audioFullKey, audioFull.mimetype),
        saveFileToBucket(audioPreview.buffer, audioPreviewKey, audioPreview.mimetype),
        saveFileToBucket(coverArt.buffer, coverArtKey, coverArt.mimetype),
      ]);

      const [track] = await db
        .insert(tracksTable)
        .values({
          title,
          artistName,
          audioFullKey,
          audioPreviewKey,
          coverArtKey,
          status: "pending",
          submittedByUserId: user.id,
          price: 9.99,
        })
        .returning();

      if (tier !== "node_auditor") {
        await db
          .update(usersTable)
          .set({ lastSubmissionDate: now })
          .where(eq(usersTable.id, user.id));
      }

      res.json({ track });
    } catch (_err) {
      res.status(500).json({ error: "Failed to submit track" });
    }
  }
);

/**
 * POST /api/tracks/:id/checkout — Stripe one-time checkout for a track.
 * Identity is gk_session-scoped; no OIDC login required.
 * Origin for success/cancel URLs is derived from REPLIT_DOMAINS (never from request headers).
 */
router.post("/tracks/:id/checkout", async (req: Request, res: Response) => {
  const sessionId = (req.cookies as Record<string, string>)?.gk_session ?? randomUUID();
  const user = await storage.getOrCreateUser(sessionId);

  const trackId = req.params.id as string;
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  const stripe = await getUncachableStripeClient();

  let priceId = track.stripePriceId;
  if (!priceId) {
    const product = await stripe.products.create({
      name: `${track.artistName} — ${track.title}`,
      metadata: { trackId: track.id, type: "track" },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 999,
      currency: "usd",
    });
    priceId = price.id;
    await db
      .update(tracksTable)
      .set({ stripeProductId: product.id, stripePriceId: price.id })
      .where(eq(tracksTable.id, trackId));
  }

  // Derive origin from server-side config only — never from req.headers.origin or
  // x-forwarded-* which an attacker-controlled page could spoof.
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ?? "localhost:80";
  const origin = `https://${domain}`;

  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "payment",
    success_url: `${origin}/library?cs={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/label/${encodeURIComponent(track.artistName)}`,
    metadata: { trackId: track.id, userId: user.id, type: "track" },
  });

  // Persist gk_session so purchases are attributable to this browser session.
  res.cookie("gk_session", user.sessionId ?? user.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ url: session.url });
});

/**
 * POST /api/tracks/confirm-purchase — called by frontend on checkout success redirect.
 * Verifies the Stripe checkout session server-side and records the purchase idempotently.
 * Complements the webhook handler for cases where the webhook fires before the redirect.
 */
router.post("/tracks/confirm-purchase", async (req: Request, res: Response) => {
  const { checkoutSessionId } = req.body as { checkoutSessionId?: string };
  if (!checkoutSessionId) {
    res.status(400).json({ error: "checkoutSessionId required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

    const meta = session.metadata ?? {};
    if (
      meta.type !== "track" ||
      !meta.trackId ||
      !meta.userId ||
      !(session.payment_status === "paid" || session.status === "complete")
    ) {
      res.status(400).json({ error: "Session is not a completed track purchase" });
      return;
    }

    await db
      .insert(purchasedTracksTable)
      .values({
        userId: meta.userId,
        trackId: meta.trackId,
        stripeCheckoutSessionId: session.id,
      })
      .onConflictDoNothing();

    res.json({ ok: true });
  } catch (_err) {
    res.status(500).json({ error: "Could not confirm purchase" });
  }
});

/** GET /api/tracks/:id/download — stream purchased track directly to the user's device */
router.get("/tracks/:id/download", async (req: Request, res: Response) => {
  const session = await resolveSessionUser(req);
  if (!session) {
    res.status(401).json({ error: "No session — purchase the track first" });
    return;
  }

  const trackId = req.params.id as string;
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  const [purchase] = await db
    .select()
    .from(purchasedTracksTable)
    .where(and(
      eq(purchasedTracksTable.userId, session.userId),
      eq(purchasedTracksTable.trackId, trackId),
    ));

  if (!purchase) {
    res.status(403).json({ error: "Purchase this track to download it" });
    return;
  }

  // Stream the file directly — no redirect, no signed URL, file lands on device.
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
  const file = objectStorageClient.bucket(bucketId).file(track.audioFullKey);

  const safeTitle = track.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "track";
  const ext = track.audioFullKey.split(".").pop() ?? "wav";
  const filename = `${safeTitle}.${ext}`;

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  file.createReadStream()
    .on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed" });
      } else {
        res.destroy(err);
      }
    })
    .pipe(res);
});

/** GET /api/admin/tracks — admin: list all tracks for moderation */
router.get("/admin/tracks", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(tracksTable)
      .orderBy(desc(tracksTable.createdAt));
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

/** GET /api/admin/tracks/pending — admin: list only pending tracks */
router.get("/admin/tracks/pending", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(tracksTable)
      .where(eq(tracksTable.status, "pending"))
      .orderBy(desc(tracksTable.createdAt));
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list pending tracks" });
  }
});

/** POST /api/admin/tracks/:id/approve — admin approve */
router.post("/admin/tracks/:id/approve", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!requireAdmin(req, res)) return;

  const trackId = req.params.id as string;
  try {
    const [track] = await db
      .update(tracksTable)
      .set({ status: "accepted" })
      .where(eq(tracksTable.id, trackId))
      .returning();
    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    res.json({ track });
  } catch (_err) {
    res.status(500).json({ error: "Failed to approve track" });
  }
});

/** POST /api/admin/tracks/:id/reject — admin reject */
router.post("/admin/tracks/:id/reject", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!requireAdmin(req, res)) return;

  const trackId = req.params.id as string;
  try {
    const [track] = await db
      .update(tracksTable)
      .set({ status: "rejected" })
      .where(eq(tracksTable.id, trackId))
      .returning();
    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    res.json({ track });
  } catch (_err) {
    res.status(500).json({ error: "Failed to reject track" });
  }
});

export default router;
