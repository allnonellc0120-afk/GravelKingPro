import { Router, type Request, type Response } from "express";
import { db, tracksTable, purchasedTracksTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { resolveTier } from "../lib/entitlement";
import { objectStorageClient } from "../lib/objectStorage";
import { getUncachableStripeClient } from "../stripeClient";

const router = Router();

/** GET /api/tracks — list all accepted tracks for storefront */
router.get("/tracks", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(tracksTable)
      .where(eq(tracksTable.status, "accepted"))
      .orderBy(tracksTable.createdAt);
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

/** GET /api/tracks/artist/:artist — list tracks by artist name */
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
      .orderBy(tracksTable.createdAt);
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

/** GET /api/library — tracks the user has purchased */
router.get("/library", async (req: Request, res: Response) => {
  const userId = req.isAuthenticated() ? req.user.id : null;
  if (!userId) {
    res.status(401).json({ error: "Sign in to view your library" });
    return;
  }
  try {
    const purchased = await db
      .select()
      .from(purchasedTracksTable)
      .where(eq(purchasedTracksTable.userId, userId));
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

/** POST /api/tracks/submit — submit a track (requires paid tier, 1/day) */
router.post("/tracks/submit", async (req: Request, res: Response) => {
  const userId = req.isAuthenticated() ? req.user.id : null;
  if (!userId) {
    res.status(401).json({ error: "Sign in to submit tracks" });
    return;
  }

  const tier = await resolveTier(req);
  if (tier === "free") {
    res.status(403).json({ error: "Paid subscription required to submit tracks" });
    return;
  }

  const { title, artistName, audioFullKey, audioPreviewKey, coverArtKey } = req.body as {
    title?: string;
    artistName?: string;
    audioFullKey?: string;
    audioPreviewKey?: string;
    coverArtKey?: string;
  };

  if (!title?.trim() || !artistName?.trim() || !audioFullKey?.trim() || !audioPreviewKey?.trim() || !coverArtKey?.trim()) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const now = new Date();
  const last = user?.lastSubmissionDate;
  if (last && (now.getTime() - new Date(last).getTime()) < 24 * 60 * 60 * 1000) {
    const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (now.getTime() - new Date(last).getTime())) / (60 * 60 * 1000));
    res.status(429).json({ error: `Track submissions are limited to once per 24 hours. Try again in ${hoursLeft} hour(s).` });
    return;
  }

  try {
    const [track] = await db
      .insert(tracksTable)
      .values({
        title: title.trim(),
        artistName: artistName.trim(),
        audioFullKey,
        audioPreviewKey,
        coverArtKey,
        status: "pending",
        submittedByUserId: userId,
        price: 9.99,
      })
      .returning();

    await db
      .update(usersTable)
      .set({ lastSubmissionDate: now })
      .where(eq(usersTable.id, userId));

    res.json({ track });
  } catch (_err) {
    res.status(500).json({ error: "Failed to submit track" });
  }
});

/** POST /api/tracks/:id/checkout — Stripe one-time checkout for a track */
router.post("/tracks/:id/checkout", async (req: Request, res: Response) => {
  const userId = req.isAuthenticated() ? req.user.id : null;
  if (!userId) {
    res.status(401).json({ error: "Sign in to purchase tracks" });
    return;
  }

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

  const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost"}`;
  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "payment",
    success_url: `${origin}/library`,
    cancel_url: `${origin}/label/${encodeURIComponent(track.artistName)}`,
    metadata: { trackId: track.id, userId, type: "track" },
  });

  res.json({ url: session.url });
});

/** GET /api/tracks/:id/download — stream purchased track directly to the user's device */
router.get("/tracks/:id/download", async (req: Request, res: Response) => {
  const userId = req.isAuthenticated() ? req.user.id : null;
  if (!userId) {
    res.status(401).json({ error: "Sign in to download tracks" });
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
      eq(purchasedTracksTable.userId, userId),
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

/** GET /api/admin/tracks — admin: list all tracks (moderation) */
router.get("/admin/tracks", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db.select().from(tracksTable).orderBy(tracksTable.createdAt);
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
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
