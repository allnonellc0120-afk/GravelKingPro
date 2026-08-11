import { Router, type Request, type Response } from "express";
import { db, tracksTable, purchasedTracksTable, usersTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { resolveTier } from "../lib/entitlement";
import { ObjectStorageService, saveObjectWithFallback, getObjectFileWithFallback } from "../lib/objectStorage";
import { sanitizeExt } from "../lib/audioGuards";
import { getUncachableStripeClient } from "../stripeClient";
import { storage } from "../storage";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { validateAssetIngestion } from "../middlewares/validateAssetIngestion";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const MAX_PREVIEW_SECONDS = 30;

/** Returns duration in seconds for an in-memory audio buffer, using ffprobe. */
async function getAudioDurationSeconds(buffer: Buffer, ext: string): Promise<number> {
  const tmpPath = join(tmpdir(), `gkp-preview-${randomUUID()}${ext}`);
  try {
    writeFileSync(tmpPath, buffer);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      tmpPath,
    ]);
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    return parseFloat(parsed.format?.duration ?? "0");
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

const router = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Columns safe to return to public callers — deliberately excludes audioFullKey.
 * audioFullKey must never appear in unauthenticated API responses; it is only
 * read server-side inside the gated /api/tracks/:id/download handler.
 */
const publicTrackCols = {
  id: tracksTable.id,
  title: tracksTable.title,
  artistName: tracksTable.artistName,
  audioPreviewKey: tracksTable.audioPreviewKey,
  coverArtKey: tracksTable.coverArtKey,
  price: tracksTable.price,
  status: tracksTable.status,
  stripeProductId: tracksTable.stripeProductId,
  stripePriceId: tracksTable.stripePriceId,
  submittedByUserId: tracksTable.submittedByUserId,
  createdAt: tracksTable.createdAt,
  updatedAt: tracksTable.updatedAt,
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function saveFileToBucket(buffer: Buffer, key: string, contentType: string): Promise<void> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
  // Falls back to the owner-project bucket when the Replit-managed bucket
  // rejects the write (platform-side 403 IAM breakage).
  await saveObjectWithFallback(bucketId, key, buffer, { contentType });
}

/** Derive gk_session-based userId. Returns null if no session cookie present. */
async function resolveSessionUser(req: Request): Promise<{ sessionId: string; userId: string } | null> {
  // OIDC-signed-in users FIRST — they never carry a gk_session cookie, so
  // without this check every vault/download route 401'd for logged-in users
  // (same bug class as the subscription-status fix).
  const authReq = req as Request & { isAuthenticated?: () => boolean; user?: { id?: string } };
  if (authReq.isAuthenticated?.() && authReq.user?.id) {
    return { sessionId: "", userId: authReq.user.id };
  }
  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (!sessionId) return null;
  const user = await storage.getUserBySession(sessionId);
  if (!user) return null;
  return { sessionId, userId: user.id };
}

/** GET /api/tracks — list all accepted tracks, newest first. audioFullKey excluded. */
router.get("/tracks", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select(publicTrackCols)
      .from(tracksTable)
      .where(eq(tracksTable.status, "accepted"))
      .orderBy(desc(tracksTable.createdAt));
    res.json({ tracks: rows });
  } catch (_err) {
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

/** GET /api/tracks/artist/:artist — list accepted tracks by artist, newest first. audioFullKey excluded. */
router.get("/tracks/artist/:artist", async (req: Request, res: Response) => {
  const artist = req.params.artist as string;
  try {
    const rows = await db
      .select(publicTrackCols)
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

/**
 * GET /api/tracks/submit-eligibility
 *
 * Returns the session user's eligibility to submit a track. Must be defined
 * before /tracks/:id routes to avoid param capture.
 *
 * Response shape:
 *  { eligible: true,  tier }
 *  { eligible: false, tier: "free",            reason: "free_tier" }
 *  { eligible: false, tier: "weekly"|"monthly", reason: "cooldown",
 *    cooldownDaysLeft: number, nextSubmissionDate: string }
 */
router.get("/tracks/submit-eligibility", async (req: Request, res: Response) => {
  // Dev privilege: an admin-authenticated request can always submit, and its
  // submissions go live instantly (see POST /tracks/submit).
  const { isAdminAuthenticated } = await import("../lib/adminAuth");
  if (isAdminAuthenticated(req)) {
    res.json({ eligible: true, tier: "admin" });
    return;
  }

  const tier = await resolveTier(req);
  if (tier === "free") {
    res.json({ eligible: false, tier: "free", reason: "free_tier" });
    return;
  }

  // node_auditor — unlimited, never on cooldown
  if (tier === "node_auditor") {
    res.json({ eligible: true, tier: "node_auditor" });
    return;
  }

  // weekly / monthly — check 7-day cooldown
  let userId: string | null = null;
  if (req.isAuthenticated()) {
    userId = req.user.id;
  } else {
    const sessionId = (req.cookies as Record<string, string>)?.gk_session;
    if (sessionId) {
      const user = await storage.getUserBySession(sessionId);
      if (user) userId = user.id;
    }
  }
  if (userId) {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const last = dbUser?.lastSubmissionDate;
    const now = new Date();
    if (last && now.getTime() - new Date(last).getTime() < SEVEN_DAYS_MS) {
      const msRemaining = SEVEN_DAYS_MS - (now.getTime() - new Date(last).getTime());
      const daysLeft = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
      const nextDate = new Date(new Date(last).getTime() + SEVEN_DAYS_MS).toISOString();
      res.json({ eligible: false, tier, reason: "cooldown", cooldownDaysLeft: daysLeft, nextSubmissionDate: nextDate });
      return;
    }
  }

  res.json({ eligible: true, tier });
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
      .select(publicTrackCols)
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
  validateAssetIngestion({ requireAudio: false }),
  async (req: Request, res: Response) => {
    // Dev privileges: an admin-authenticated request (gk_admin cookie or
    // x-admin-key header, both derived from ADMIN_KEY) bypasses the paid-tier
    // gate, the 7-day cooldown, and moderation — the track goes live instantly.
    const { isAdminAuthenticated } = await import("../lib/adminAuth");
    const isAdmin = isAdminAuthenticated(req);

    let tier = "admin";
    if (!isAdmin) {
      tier = await resolveTier(req);
      if (tier === "free") {
        res.status(403).json({ error: "A Pro subscription is required to submit tracks. Subscribe at /pricing." });
        return;
      }
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

    // Enforce preview ≤30 s server-side using ffprobe so this cannot be bypassed via the API.
    const previewDuration = await getAudioDurationSeconds(
      audioPreview.buffer,
      `.${sanitizeExt(audioPreview.originalname)}`,
    );
    if (previewDuration > MAX_PREVIEW_SECONDS) {
      res.status(400).json({
        error: `Preview clip must be ${MAX_PREVIEW_SECONDS} seconds or less (yours is ${Math.round(previewDuration)}s).`,
      });
      return;
    }

    const now = new Date();

    // Resolve the submitting user. OIDC auth takes priority; fall back to gk_session.
    let user: Awaited<ReturnType<typeof storage.getOrCreateUser>> | null = null;
    let userId: string | null = null;
    if (req.isAuthenticated()) {
      userId = req.user.id;
      const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (dbUser) user = dbUser;
    } else {
      const sessionId = (req.cookies as Record<string, string>)?.gk_session;
      if (sessionId) {
        user = await storage.getOrCreateUser(sessionId);
        userId = user.id;
      }
    }
    const submittedByUserId = userId ?? "admin";

    // node_auditor has unlimited submissions; weekly/monthly tiers are rate-limited
    // to once per 7 days. Admins and node_auditor are exempt.
    if (!isAdmin && tier !== "node_auditor" && user) {
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
      // Full audio is stored under private/ so it is never reachable via the
      // public-objects route regardless of PUBLIC_OBJECT_SEARCH_PATHS config.
      const audioFullKey = `private/tracks/${id}/audio_full.${sanitizeExt(audioFull.originalname)}`;
      const audioPreviewKey = `tracks/${id}/audio_preview.${sanitizeExt(audioPreview.originalname)}`;
      const coverArtKey = `tracks/${id}/cover_art.${sanitizeExt(coverArt.originalname)}`;

      await Promise.all([
        // Full (paid) audio: bucket root under private/ — read directly by the gated download route.
        saveFileToBucket(audioFull.buffer, audioFullKey, audioFull.mimetype),
        // Preview + cover are PUBLIC assets: they must be written under the public
        // search path so the /storage/public-objects route (searchPublicObject) finds them.
        objectStorageService.savePublicObject(audioPreviewKey, audioPreview.buffer, audioPreview.mimetype),
        objectStorageService.savePublicObject(coverArtKey, coverArt.buffer, coverArt.mimetype),
      ]);

      const [track] = await db
        .insert(tracksTable)
        .values({
          title,
          artistName,
          audioFullKey,
          audioPreviewKey,
          coverArtKey,
          // Dev uploads go live immediately; everyone else waits for moderation.
          status: isAdmin ? "accepted" : "pending",
          submittedByUserId,
          price: 9.99,
        })
        .returning();

      // Only consume a 7-day submission slot for rate-limited tiers.
      if (!isAdmin && tier !== "node_auditor" && user) {
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

  // Only tracks approved by admins can be sold via checkout.
  if (track.status !== "accepted") {
    res.status(403).json({ error: "Track not yet available for purchase" });
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
    metadata: { track_id: track.id, user_id: user.id, type: "track" },
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
      !meta.track_id ||
      !meta.user_id ||
      !(session.payment_status === "paid" || session.status === "complete")
    ) {
      res.status(400).json({ error: "Session is not a completed track purchase" });
      return;
    }

    await db
      .insert(purchasedTracksTable)
      .values({
        userId: meta.user_id,
        trackId: meta.track_id,
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

  if (track.status !== "accepted") {
    res.status(403).json({ error: "Track not yet available for download" });
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

  // Optional ?format=mp3 — serve the 320 kbps MP3 sibling (audio_full.mp3)
  // when it exists; older tracks without one silently fall back to WAV.
  let audioKey = track.audioFullKey;
  let contentType = "audio/wav";
  // Resolve against the primary bucket first, then the owner-project fallback
  // bucket (tracks vaulted during a primary-bucket outage live there).
  let file = null;
  if (req.query.format === "mp3") {
    const mp3Key = track.audioFullKey.replace(/\.[^./]+$/, ".mp3");
    if (mp3Key !== track.audioFullKey) {
      const mp3File = await getObjectFileWithFallback(bucketId, mp3Key).catch(() => null);
      if (mp3File) {
        audioKey = mp3Key;
        contentType = "audio/mpeg";
        file = mp3File;
      }
    }
  }
  if (!file) {
    try {
      file = await getObjectFileWithFallback(bucketId, audioKey);
    } catch (err) {
      // Storage incident (neither backend checkable) — report it as such,
      // never as a misleading "not found".
      req.log?.error?.({ err }, "track download: storage backends unavailable");
      res.status(503).json({ error: "Storage backend unavailable — try again shortly" });
      return;
    }
  }
  if (!file) {
    res.status(404).json({ error: "Track audio not found in storage" });
    return;
  }

  const safeTitle = track.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "track";
  const ext = audioKey.split(".").pop() ?? "wav";
  const filename = `${safeTitle}.${ext}`;

  res.setHeader("Content-Type", contentType);
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
  if (!await requireAdmin(req, res)) return;
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
  if (!await requireAdmin(req, res)) return;
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
  if (!await requireAdmin(req, res)) return;

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
  if (!await requireAdmin(req, res)) return;

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

/** POST /api/admin/tracks/seed — admin-only: seed label tracks into production DB */
router.post("/admin/tracks/seed", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!await requireAdmin(req, res)) return;

  const seedData = [
    {
      title: "You Used to Think I Was Superman",
      artistName: "TGK, The Gravelking",
      audioFullKey: "private/releases/tgk-the-gravelking/you-used-to-think-i-was-superman-full.wav",
      audioPreviewKey: "releases/tgk-the-gravelking/you-used-to-think-i-was-superman-preview.wav",
      coverArtKey: "releases/tgk-the-gravelking/you-used-to-think-i-was-superman-cover.jpg",
      price: 9.99,
      status: "accepted" as const,
    },
  ];

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const t of seedData) {
    const existing = await db
      .select({ id: tracksTable.id })
      .from(tracksTable)
      .where(and(eq(tracksTable.title, t.title), eq(tracksTable.artistName, t.artistName)));
    if (existing.length > 0) {
      skipped.push(t.title);
      continue;
    }
    await db.insert(tracksTable).values(t);
    inserted.push(t.title);
  }

  res.json({ inserted, skipped, count: inserted.length });
});

export default router;
