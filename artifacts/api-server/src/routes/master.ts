import { Router, Request, Response, NextFunction } from "express";
import { fileURLToPath } from "url";
import { streamBuffer } from "../lib/streamResponse";
import { industryIdsHmacSegment } from "../lib/forensicCertificate";
import multer from "multer";
import { unlink, readdir, stat } from "fs/promises";
import { issueDownloadToken, verifyDownloadToken } from "../lib/downloadGate";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID, createHash, createHmac, timingSafeEqual } from "crypto";
import { rateLimit } from "../lib/rateLimiter";
import { isAdminAuthenticated } from "../lib/adminAuth";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { probeFileDuration, sanitizeExt, normalizeToWav, MAX_AUDIO_DURATION_S } from "../lib/audioGuards";
import { hasStudio } from "../lib/entitlement";
import { getUsageUser, incrementUsage, FREE_LIMITS } from "../lib/usage";
import { checkExportQuota, consumeExport, exportLimitPayload } from "../lib/exportQuota";
import type { User } from "@workspace/db";
import { embedLsbPayload, extractLsbPayload } from "../kernel-v3";
import { readFile, writeFile } from "fs/promises";
import { db, ipCertStubsTable } from "@workspace/db";
import { masterJobsTable } from "@workspace/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { styleAuthorshipScore } from "@workspace/authorship";
import { backupCertStub } from "../lib/firestore";
import { logToolError } from "../lib/errorTracker";
import { recordActivity } from "../lib/activityTracker";
import { validateAssetIngestion } from "../middlewares/validateAssetIngestion";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  CREDIT_COSTS,
  grantCredits,
  resolveCreditUser,
  spendCredits,
} from "../lib/credits";

/** Optional denoise stage folded into mastering (applied before the preset). */
const DENOISE_FILTER = "afftdn=nf=-25,anlmdn=s=7";

const execFileAsync = promisify(execFile);
const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) => {
      cb(null, `gk_master_${randomUUID()}.${sanitizeExt(file.originalname)}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB matches the audio route; 200 MB was unnecessarily large
});

const masterRouter = Router();

const masterJobStorage = new ObjectStorageService();

/** Best-effort state write: a database outage must not turn a successful DSP
 * request into an unreported process crash. The final storage write remains
 * required before a job can be marked completed. */
async function updateMasterJob(
  id: string,
  values: Partial<typeof masterJobsTable.$inferInsert>,
): Promise<void> {
  await db.update(masterJobsTable).set(values).where(eq(masterJobsTable.id, id));
}

/** Marks jobs interrupted by a process restart as failed rather than leaving
 * them permanently "running". Inputs are request-local /tmp files, so they
 * cannot safely be resumed after a restart. */
export async function recoverStaleMasterJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  await db.update(masterJobsTable).set({
    status: "failed",
    stage: "interrupted",
    error: "Mastering was interrupted by a server restart. Please submit the track again.",
    completedAt: new Date(),
  }).where(
    // A running job with no heartbeat/update for ten minutes cannot have a
    // surviving worker in this in-process implementation.
    and(eq(masterJobsTable.status, "running"), lt(masterJobsTable.updatedAt, cutoff)),
  );
}

/** Delete mastered-download copies older than the 1-hour token TTL. */
async function sweepStaleDownloads(): Promise<void> {
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const f of await readdir("/tmp")) {
      if (!f.startsWith("gk_dl_")) continue;
      try {
        const s = await stat(`/tmp/${f}`);
        if (s.mtimeMs < cutoff) await unlink(`/tmp/${f}`);
      } catch { /* already gone */ }
    }
  } catch { /* /tmp unreadable — nothing to sweep */ }
}

const masterRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 10 });
const masterConcurrency = concurrencyLimit(3);

/**
 * B2B partner API key — derived from SESSION_SECRET so the same key is valid
 * in dev and production without storing another secret. Rotating
 * SESSION_SECRET rotates every partner key.
 */
export function partnerApiKey(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return "gkp_live_" + createHmac("sha256", secret).update("partner-api-v1").digest("hex").slice(0, 40);
}

/** True when the request carries a valid partner API key (x-api-key header). */
function isPartnerRequest(req: Request): boolean {
  const key = partnerApiKey();
  const presented = req.headers["x-api-key"];
  if (!key || typeof presented !== "string") return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The documented partner ingestion alias is a credentialed B2B surface.
 * Reject before Multer parses or writes an upload so an invalid key cannot
 * consume disk or DSP capacity. The internal /kernel/master route keeps its
 * existing browser/session behavior.
 */
const requirePartnerApiKey = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path !== "/v1/ingest") {
    next();
    return;
  }
  if (!isPartnerRequest(req)) {
    res.setHeader("WWW-Authenticate", "ApiKey");
    res.status(401).json({ success: false, error: "Valid partner API key required." });
    return;
  }
  next();
};

/**
 * Partner-key requests get a much higher, per-key quota (batch ingestion of
 * hundreds of tracks) instead of the per-IP browser limit — but NOT an
 * unlimited bypass, so a leaked key can't burn compute forever.
 * 300 req / 10 min ≈ 500-track batch in ~17 minutes at concurrency 3.
 */
const partnerWindow = { count: 0, resetAt: 0 };
const partnerAwareRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  if (isPartnerRequest(req)) {
    const now = Date.now();
    if (partnerWindow.resetAt <= now) { partnerWindow.count = 0; partnerWindow.resetAt = now + 10 * 60_000; }
    partnerWindow.count += 1;
    if (partnerWindow.count > 300) {
      res.setHeader("Retry-After", String(Math.ceil((partnerWindow.resetAt - now) / 1000)));
      res.status(429).json({ success: false, error: "Partner quota exceeded (300 requests / 10 min). Retry shortly." });
      return;
    }
    next();
    return;
  }
  // Canonicalize the path so /kernel/master and /v1/ingest share ONE
  // per-IP bucket — alternating aliases must not double the allowance.
  const canonical = Object.create(req, { path: { value: "/kernel/master" } }) as Request;
  masterRateLimit(canonical, res, next);
};

export type MasterPreset =
  | "baseline"
  | "spacious"
  | "normal"
  | "broadcast"
  | "vinyl"
  | "podcast"
  | "club"
  | "film"
  | "youtube"
  | "soundcloud"
  | "apple";

const BASELINE_FILTER = "bass=g=1,loudnorm=I=-14:TP=-1:LRA=11";
const REVERB_SPACE = "aecho=0.8:0.7:40:0.25,extrastereo=m=1.4";

/**
 * Route presets → Morris Law Kernel (Python) preset id + loudness staging.
 * The kernel owns EQ shelves, saturation, adaptive sidechain compression, the
 * brickwall limiter and LUFS staging; each route preset maps onto a kernel
 * preset plus its platform loudness target.
 */
export const KERNEL_PRESET_MAP: Record<
  MasterPreset,
  { kernel: string; lufs: number; ceiling: number }
> = {
  baseline:   { kernel: "natural_body",   lufs: -14, ceiling: -0.8 },
  spacious:   { kernel: "spatial_edge",   lufs: -14, ceiling: -0.8 },
  normal:     { kernel: "natural_body",   lufs: -16, ceiling: -1.0 },
  broadcast:  { kernel: "gravelking_max", lufs: -23, ceiling: -2.0 },
  vinyl:      { kernel: "warm_vintage",   lufs: -16, ceiling: -1.0 },
  podcast:    { kernel: "natural_body",   lufs: -16, ceiling: -1.5 },
  club:       { kernel: "sub_fire",       lufs: -12, ceiling: -0.5 },
  film:       { kernel: "natural_body",   lufs: -24, ceiling: -2.0 },
  youtube:    { kernel: "natural_body",   lufs: -14, ceiling: -1.0 },
  soundcloud: { kernel: "gravelking_max", lufs: -11, ceiling: -0.5 },
  apple:      { kernel: "natural_body",   lufs: -16, ceiling: -1.0 },
};

export const MASTER_PRESETS: Record<
  MasterPreset,
  { label: string; description: string; filter: string }
> = {
  baseline: {
    label: "Baseline",
    description: "Balanced master with a +10% low-end lift at YouTube loudness. The recommended starting point.",
    filter: BASELINE_FILTER,
  },
  spacious: {
    label: "Vocal Air / Crisp Highs",
    description: "Open top end with stereo space for width and depth.",
    filter: `bass=g=1,${REVERB_SPACE},loudnorm=I=-14:TP=-1:LRA=11`,
  },
  normal: {
    label: "Normal",
    description: "Baseline with slightly lower target loudness. Good for any content.",
    filter: "bass=g=1,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  broadcast: {
    label: "Broadcast",
    description: "Baseline + highpass + EBU R128 spec. Ideal for TV, radio, and streaming.",
    filter: "bass=g=1,highpass=f=80,loudnorm=I=-23:TP=-2:LRA=7",
  },
  vinyl: {
    label: "Tape Warmth / Saturation",
    description: "Baseline + warm analog boost for lows and subtle air.",
    filter: "bass=g=3,treble=g=1,loudnorm=I=-16:TP=-1:LRA=13",
  },
  podcast: {
    label: "Vocal Punch / Phase Focus",
    description: "Baseline + highpass + dynamic compression for speech clarity.",
    filter:
      "bass=g=1,highpass=f=100,compand=attacks=0.01:decays=0.1:points=-70/-70|-30/-25|0/-5|20/-5,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  club: {
    label: "Sub Low-End / Kick Weight",
    description: "Baseline + heavy bass, punchy transients, and loud dance-floor energy.",
    filter:
      "bass=g=4,treble=g=2,compand=attacks=0.005:decays=0.05:points=-70/-70|-20/-15|0/-3|20/-3,loudnorm=I=-12:TP=-0.5:LRA=8",
  },
  film: {
    label: "Film",
    description: "Baseline + wide cinematic dynamics and dialogue presence.",
    filter:
      "bass=g=1,highpass=f=40,compand=attacks=0.05:decays=0.5:points=-70/-70|-40/-35|-20/-15|0/-5|20/-5,loudnorm=I=-24:TP=-2:LRA=15",
  },
  youtube: {
    label: "Final Gain / Ceiling (−14.0 LUFS)",
    description: "Baseline tuned for YouTube's -14 LUFS normalization.",
    filter: "bass=g=1,loudnorm=I=-14:TP=-1:LRA=11",
  },
  soundcloud: {
    label: "SoundCloud",
    description: "Baseline with louder target for SoundCloud uploads.",
    filter: "bass=g=1,loudnorm=I=-11:TP=-0.5:LRA=9",
  },
  apple: {
    label: "Apple Music",
    description: "Baseline tuned for Apple Sound Check at -16 LUFS.",
    filter: "bass=g=1,loudnorm=I=-16:TP=-1:LRA=11",
  },
};

const VALID_PRESETS = new Set(Object.keys(MASTER_PRESETS));

// Copyright/ownership validation is OPT-IN. Plain mastering works on any
// track — karaoke backing, covers, reference mixes — with no ownership
// warranty and no watermark. Only when the client asks to certify ownership
// (certify=true) do the ingestion checks run and the IP cert get embedded.
const maybeValidateIngestion = (req: Request, res: Response, next: NextFunction): void => {
  if ((req.body as Record<string, unknown> | undefined)?.certify === "true") {
    void validateAssetIngestion({
      requireAudio: true,
      commercialFingerprint: true,
      allowUncertifiedFallback: true,
    })(req, res, next);
    return;
  }
  next();
};

// Convert an already-mastered result to MP3 without running the mastering
// kernel a second time. The finish screen posts its mastered WAV blob here.
masterRouter.post(
  "/kernel/export-result-mp3",
  partnerAwareRateLimit,
  masterConcurrency,
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No mastered audio file received." });
      return;
    }
    const sourcePath = req.file.path;
    const outputPath = `/tmp/gk_master_export_${randomUUID()}.mp3`;
    try {
      const creditUser = await resolveCreditUser(req);
      if (!creditUser) {
        res.status(401).json({ error: "Sign in to download this MP3." });
        return;
      }

      await execFileAsync("ffmpeg", [
        "-y", "-i", sourcePath,
        "-acodec", "libmp3lame", "-b:a", "320k", "-ar", "44100",
        outputPath,
      ], { maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });

      if (!creditUser.isDeveloper) {
        const reference = `export_mp3:${randomUUID()}`;
        const spent = await spendCredits(
          creditUser.id,
          CREDIT_COSTS.exportMp3,
          "export_mp3",
          reference,
        );
        if (!spent.ok) {
          res.status(402).json({
            error: `MP3 download costs ${CREDIT_COSTS.exportMp3} credits. You have ${spent.balance}.`,
            code: "INSUFFICIENT_CREDITS",
            creditsRequired: CREDIT_COSTS.exportMp3,
            creditsBalance: spent.balance,
            purchaseUrl: "/pricing#credits",
          });
          return;
        }
        res.setHeader("X-GK-Credits-Balance", String(spent.balance));
      }

      const mp3Buffer = Buffer.from(await readFile(outputPath));
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", 'attachment; filename="gravelking_mastered.mp3"');
      streamBuffer(res, mp3Buffer);
    } catch (err) {
      req.log.error({ err }, "mastered MP3 export failed");
      if (!res.headersSent) res.status(500).json({ error: "Could not create the MP3 download." });
    } finally {
      await Promise.all([
        unlink(sourcePath).catch(() => {}),
        unlink(outputPath).catch(() => {}),
      ]);
    }
  },
);

masterRouter.post(
  ["/kernel/master", "/v1/ingest", "/export-wav", "/export-mp3"],
  requirePartnerApiKey,
  partnerAwareRateLimit,
  masterConcurrency,
  upload.single("audio"),
  // Timing instrumentation: multer has just finished writing the upload, so
  // (now − request arrival) is the multipart upload + parse cost.
  (_req: Request, res: Response, next: NextFunction) => {
    const t0 = (res.locals as { requestStartMs?: number }).requestStartMs ?? performance.now();
    res.locals.gkUploadMs = performance.now() - t0;
    next();
  },
  maybeValidateIngestion,
  async (req: Request, res: Response) => {
    // Log the moment the request enters the handler — if a crash happens before
    // the pino-http completion log fires, this entry at least shows the request
    // was received and what preset/file was requested.
    req.log.info(
      { preset: req.body?.preset, filename: req.file?.originalname, size: req.file?.size },
      "master request received"
    );
    recordActivity((req.cookies as Record<string, string>)?.["gk_session"], "Mastering Tool");

    if (!req.file) {
      res.status(400).json({ success: false, error: "No audio file uploaded." });
      return;
    }

    // Multipart fields are client-controlled: a repeated field arrives as an
    // array, and anything non-string is malformed. Coerce defensively so bad
    // input can never throw (→ 500); strict numeric fields reject with 400.
    const asStr = (v: unknown): string | undefined =>
      typeof v === "string" ? v : undefined;

    const presetName    = asStr(req.body.preset) || "baseline";
    if (!VALID_PRESETS.has(presetName)) {
      res.status(400).json({ success: false, error: `Unknown preset "${presetName}".` });
      return;
    }

    // Intensity 0–100 (default 75). Passed straight through to the Python
    // kernel, which scales every EQ/drive/comp parameter by intensity/100.
    // Malformed or out-of-range values are a client bug → 400, never a silent
    // clamp (a clamped -1 would master at intensity 0 and confuse the user).
    if (req.body.intensity !== undefined && typeof req.body.intensity !== "string") {
      res.status(400).json({ success: false, error: "Invalid intensity: expected a single numeric value." });
      return;
    }
    const rawIntensityStr = (asStr(req.body.intensity) ?? "").trim();
    const rawIntensity    = rawIntensityStr === "" ? 75 : Number(rawIntensityStr);
    if (!Number.isFinite(rawIntensity) || rawIntensity < 0 || rawIntensity > 100) {
      res.status(400).json({ success: false, error: `Invalid intensity "${rawIntensityStr}". Expected a number between 0 and 100.` });
      return;
    }
    const intensity = rawIntensity;

    const denoise         = asStr(req.body.denoise) === "true";

    // Sidechain compressor params — mirrors MorrisLawKernel.process() signature.
    // sidechainFilter: 'highpass' | 'lowpass' | 'none'  (default 'highpass')
    // sidechainFreq:   Hz for the detector HPF/LPF        (default 160)
    // stereoLink:      both channels track same GR        (default true)
    const rawScFilter = asStr(req.body.sidechainFilter) || "highpass";
    const sidechainFilter: "highpass" | "lowpass" | "none" =
      rawScFilter === "lowpass" ? "lowpass" : rawScFilter === "none" ? "none" : "highpass";
    // Malformed (non-numeric / non-finite) detector frequency → 400. In-range
    // numeric values pass through; numeric-but-extreme values clamp to the
    // kernel's supported 20–2000 Hz detector band.
    if (req.body.sidechainFreq !== undefined && typeof req.body.sidechainFreq !== "string") {
      res.status(400).json({ success: false, error: "Invalid sidechainFreq: expected a single numeric value." });
      return;
    }
    const rawScFreqStr = (asStr(req.body.sidechainFreq) ?? "").trim();
    const rawScFreq    = rawScFreqStr === "" ? 160 : Number(rawScFreqStr);
    if (!Number.isFinite(rawScFreq) || rawScFreq <= 0) {
      res.status(400).json({ success: false, error: `Invalid sidechainFreq "${rawScFreqStr}". Expected a positive frequency in Hz.` });
      return;
    }
    const sidechainFreq = Math.min(2000, Math.max(20, rawScFreq));
    const stereoLink = asStr(req.body.stereoLink) !== "false";
    // adaptive_mode: 'bass_aware' bandpasses the sidechain detector around the
    // bass range (sidechainFreq × 0.5 – × 2.5) + dynaudnorm so the compressor
    // tracks bass energy, not broadband level. 'off' = fixed detector filter.
    const rawAdaptive = asStr(req.body.adaptiveMode) || "bass_aware";
    const adaptiveMode: "off" | "bass_aware" = rawAdaptive === "off" ? "off" : "bass_aware";

    // auto_threshold: run a quick volumedetect pass and set threshold =
    // (mean RMS dBFS + offset). Saves the user from guessing numeric values.
    const autoThreshold       = asStr(req.body.autoThreshold) === "true";
    const rawOffset           = parseFloat(asStr(req.body.autoThresholdOffset) || "-16");
    const autoThresholdOffset = Math.min(-6, Math.max(-30, isNaN(rawOffset) ? -16 : rawOffset));

    // certify=true → copyright/ownership validation (runs in middleware) plus
    // an embedded IP cert. Default false → master any track, no watermark.
    const certifyRequested = asStr(req.body.certify) === "true";
    const fingerprintStatus =
      req.ingestionValidation?.metadata.commercialFingerprint.status ?? "not_run";
    // ACRCloud controls only the stamp. Mastering always continues when the
    // provider is down, suspended, times out, or returns a catalog match.
    const certify =
      certifyRequested &&
      (fingerprintStatus === "no_match" || fingerprintStatus === "local_no_match");
    const certificationStatus =
      !certifyRequested ? "not-requested"
      : fingerprintStatus === "local_no_match" ? "sealed-local"
      : certify ? "sealed"
      : fingerprintStatus === "match" ? "skipped-acr-match"
      : "skipped-acr-unavailable";
    // Artist handle attached to every cert
    const artistHandle = (asStr(req.body.artist) || "Unknown Artist")
      .trim().slice(0, 64).replace(/[^\w\s@._-]/g, "");
    // Style prompt — human creative direction for the instrumental
    const rawStylePrompt = (asStr(req.body.stylePrompt) || "").trim().slice(0, 1000);
    const styleScore     = styleAuthorshipScore(rawStylePrompt);

    // Global music industry identifiers (optional, artist-supplied).
    // Bound to the cert record so they become part of the tamper-evident chain.
    const ipiNumber = (asStr(req.body.ipiNumber) || "").trim().slice(0, 64) || null;
    const iswc      = (asStr(req.body.iswc)      || "").trim().slice(0, 32) || null;
    const isrc      = (asStr(req.body.isrc)      || "").trim().slice(0, 32) || null;

    // Certificate classification — persisted on the cert stub so unlock/
    // document flows know exactly what was certified and where it came from.
    // Category: what kind of work. Provenance: how the audio reached us.
    // This route only ever receives uploaded bytes, so provenance is either
    // an external upload (ACRCloud-gated via certify=true) or an in-app
    // vocal-booth recording the client flags explicitly. 'internal' is
    // reserved for server-side generation (mlkOrchestrator) and can never be
    // claimed through this route.
    const CERT_CATEGORIES = new Set(["lyrics", "instrumental", "full_track", "vocal_performance"]);
    const rawCategory  = (asStr(req.body.certCategory) || "").trim();
    const certCategory = CERT_CATEGORIES.has(rawCategory) ? rawCategory : "full_track";
    const certProvenance =
      (asStr(req.body.certProvenance) || "").trim() === "vocal_recording"
        ? "vocal_recording"
        : "external_upload";

    // Pro+ tiers get full-length masters. WAV uses the tier-aware quota (Pro:
    // 10/7d; King: 40/30d); MP3 is unlimited. Free users get one full
    // download, then 30-sec previews.
    const partnerReq = isPartnerRequest(req);
    const adminReq = isAdminAuthenticated(req);
    const mp3Requested = req.path === "/export-mp3";
    // Resolve paid access before selecting wallet mode. Lifetime/owner and
    // paid Studio sessions must never be routed into the pay-per-master
    // credit flow merely because their session row is not developer-flagged.
    const paidTier = !partnerReq && !adminReq && await hasStudio(req);
    const creditUser = !partnerReq && !adminReq
      ? await resolveCreditUser(req)
      : null;
    const walletMode = !!creditUser && !creditUser.isDeveloper;
    // The requested output format sets the wallet charge. Certification stays
    // free while the provenance workflow is being adopted.
    const walletCost = mp3Requested ? CREDIT_COSTS.exportMp3 : CREDIT_COSTS.exportWav;
    const walletKind = mp3Requested ? "export_mp3" : "export_wav";
    const walletReference = `${walletKind}:${randomUUID()}`;
    let walletSpent = false;
    // The master admin key is an explicit operational override: it bypasses
    // tier, free allowance, and rolling export quota checks for this route.
    // Pro+ users get unlimited MP3 exports; WAV remains tier-quota limited.
    const unlimited = partnerReq || adminReq || creditUser?.isDeveloper === true;
    const wavQuotaEligible = paidTier && !mp3Requested && !walletMode;

    // Check (don't consume) BEFORE the expensive kernel run; consume after
    // a successful master, right where free downloads are counted.
    let exportUser: User | null = null;
    if (wavQuotaEligible) {
      exportUser = await getUsageUser(req, res);
      const quota = checkExportQuota(exportUser);
      if (!quota.allowed) {
        res.status(429).json(exportLimitPayload(quota));
        return;
      }
    }

    let isSample = false;
    let usageUserId: string | null = null;
    let usedTotalDownloads = 0;
    if (!unlimited && !walletMode) {
      const usageUser = await getUsageUser(req, res);
      usageUserId = usageUser.id;

      // Email gate — free tools require a captured email before any processing.
      // Admins (gk_admin cookie) bypass it entirely.
      if (!usageUser.email?.trim() && !isAdminAuthenticated(req)) {
        res.status(403).json({
          success: false,
          code: "EMAIL_REQUIRED",
          error: "Enter your email to use the free mastering tool.",
        });
        return;
      }

      usedTotalDownloads = usageUser.totalDownloads ?? 0;
      const usedDownloads = usageUser.freeMasterDownloads ?? 0;
      const usedPreviews = usageUser.freeMasterPreviews ?? 0;

      if (usedDownloads >= FREE_LIMITS.freeMasterDownloads) {
        // Free full master already used — check preview allowance
        if (usedPreviews >= FREE_LIMITS.freeMasterPreviews) {
          // Both free master and preview used — hard paywall
          res.status(402).json({
            success: false,
            code: "LIMIT_REACHED",
            feature: "master",
            error: "You've used your free master and preview. Subscribe to GravelKing Pro for unlimited masters.",
            fallback: { action: "subscribe", url: "/pricing" },
          });
          return;
        }
        isSample = true; // serve 30-sec preview
      }
    }

    const suppliedClientJobId = typeof req.body.clientJobId === "string" ? req.body.clientJobId : null;
    const suppliedIdempotencyKey = typeof req.headers["idempotency-key"] === "string"
      ? req.headers["idempotency-key"]
      : null;
    if ((suppliedClientJobId && !/^[A-Za-z0-9_.:-]{1,128}$/.test(suppliedClientJobId)) ||
        (suppliedIdempotencyKey && !/^[A-Za-z0-9_.:-]{1,128}$/.test(suppliedIdempotencyKey))) {
      res.status(400).json({ success: false, error: "Invalid client job id or Idempotency-Key." });
      return;
    }

    // This record is deliberately created after entitlement/quota gates but
    // before normalization and kernel DSP. Anonymous browser use already has a
    // durable usage user by this point; partner jobs remain ownerless and are
    // intentionally not exposed by the owner-only job APIs below.
    const jobId = randomUUID();
    const jobOwnerId = req.dbUser?.id ?? usageUserId ?? exportUser?.id ?? creditUser?.id ?? null;
    const insertedJob = await db.insert(masterJobsTable).values({
      id: jobId,
      userId: jobOwnerId,
      type: "mastering",
      status: "queued",
      progress: 0,
      stage: "queued",
      originalFilename: req.file.originalname.slice(0, 255),
      inputRef: req.file.path,
      requestConfig: {
        preset: presetName,
        intensity,
        denoise,
        sidechainFilter,
        sidechainFreq,
        stereoLink,
        adaptiveMode,
        autoThreshold,
        certify: certifyRequested,
        format: mp3Requested ? "mp3" : "wav",
      },
      clientJobId: suppliedClientJobId,
      idempotencyKey: suppliedIdempotencyKey,
    }).onConflictDoNothing().returning({ id: masterJobsTable.id });
    if (!insertedJob.length) {
      await unlink(req.file.path).catch(() => {});
      res.status(409).json({ success: false, error: "A mastering job with this client job id already exists." });
      return;
    }
    res.setHeader("X-GK-Master-Job-Id", jobId);

    const uploadedPath = req.file.path;
    let filePath = uploadedPath;
    let normalizedPath: string | null = null;
    const outPath = `/tmp/gk_master_out_${randomUUID()}.wav`;

    try {
      await updateMasterJob(jobId, {
        status: "running", progress: 5, stage: "normalizing", startedAt: new Date(),
      });
      // Normalize any format (m4a, mp4, mov, ogg, webm…) → WAV before the
      // preset chain. ffmpeg auto-detects the container so the user can drop
      // anything from their photo library and have it just work.
      normalizedPath = await normalizeToWav(uploadedPath);
      filePath = normalizedPath;
      await updateMasterJob(jobId, { progress: 15, stage: "validated" });

      // Duration guard
      const duration = await probeFileDuration(filePath);
      if (duration > MAX_AUDIO_DURATION_S) {
        await updateMasterJob(jobId, {
          status: "failed", stage: "rejected",
          error: "Audio exceeds the maximum allowed duration.",
          completedAt: new Date(),
        }).catch(() => {});
        res.status(422).json({
          success: false,
          error: `Audio exceeds the maximum allowed duration of ${Math.floor(MAX_AUDIO_DURATION_S / 60)} minutes.`,
        });
        return;
      }

      // ── Pre-pass: 30-sec preview trim + optional denoise via ffmpeg ──────
      // ffmpeg here is ingest plumbing ONLY (format handling / trimming /
      // denoise). All DSP — EQ, saturation, adaptive sidechain compression,
      // limiting, loudness staging — runs in the Python Morris Law Kernel.
      let kernelInputPath = filePath;
      let prePassPath: string | null = null;
      if (isSample || denoise) {
        prePassPath = `/tmp/gk_master_pre_${randomUUID()}.wav`;
        await execFileAsync("ffmpeg", [
          "-y", "-i", filePath,
          ...(isSample ? ["-t", "30"] : []),
          ...(denoise ? ["-af", DENOISE_FILTER] : []),
          "-ac", "2", "-acodec", "pcm_s16le", "-ar", "44100", prePassPath,
        ], { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
        kernelInputPath = prePassPath;
      }

      // Pre-kernel bytes for cert content-hash binding (read before cleanup).
      const preKernelBytes = await readFile(kernelInputPath);

      // ── Morris Law Kernel v3.5 (Python + Numba) — the ONLY DSP path ─────
      // All DSP — EQ, saturation, adaptive sidechain compression, limiting,
      // loudness staging — runs exclusively in the local Python MLK worker.
      // There is no cloud / remote fallback by design. If the kernel fails,
      // the request fails loudly with a 500.
      const kp = KERNEL_PRESET_MAP[presetName as MasterPreset];
      let pyStats: {
        numba?: boolean; scFreqUsed?: number;
        detectedRmsDb?: number; appliedThresholdDb?: number;
      } = {};
      const kernelEngine = "local" as const;

      const kernelStart = performance.now();
      let kernelMs: number | null = null;
      try {
        await updateMasterJob(jobId, { progress: 20, stage: "mastering" });
        {
          // Resolve relative to this bundle (dist/index.mjs → ../python), never
          // process.cwd() — the container's cwd is /app, not the package dir.
          const pyWorker = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
          const { stdout } = await execFileAsync("python3", [
            pyWorker,
            "--input", kernelInputPath,
            "--output", outPath,
            "--preset", kp.kernel,
            "--intensity", String(intensity),
            "--sidechain-filter", sidechainFilter,
            "--sidechain-freq", String(sidechainFreq),
            "--stereo-link", stereoLink ? "true" : "false",
            "--adaptive-mode", adaptiveMode,
            "--auto-threshold", autoThreshold ? "true" : "false",
            "--auto-offset", String(autoThresholdOffset),
            "--target-lufs", String(kp.lufs),
            "--ceiling-db", String(kp.ceiling),
          ], { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
          pyStats = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
        }
      } catch (err: any) {
        await updateMasterJob(jobId, {
          status: "failed", stage: "failed",
          error: String(err?.message ?? "The Morris Law Kernel failed.").slice(0, 4000),
          completedAt: new Date(),
        }).catch(() => {});
        req.log.error(
          { stderr: err?.stderr?.slice?.(-800) ?? String(err?.message ?? err) },
          "Morris Law Kernel failed (remote and local)",
        );
        res.status(500).json({
          success: false,
          error: "The Morris Law Kernel failed to process this file. Try a different file or contact support.",
        });
        return;
      } finally {
        kernelMs = performance.now() - kernelStart;
        if (prePassPath) await unlink(prePassPath).catch(() => {});
      }
      await updateMasterJob(jobId, { progress: 70, stage: "mastered" });

      // Observability surfaced in response headers (mirrors kernel internals).
      const detectedRmsDb      = autoThreshold ? (pyStats.detectedRmsDb ?? null) : null;
      const appliedThresholdDb = autoThreshold ? (pyStats.appliedThresholdDb ?? null) : null;
      const autoThresholdFallback = autoThreshold && detectedRmsDb === null;
      if (autoThresholdFallback) {
        req.log.warn({ autoThresholdOffset }, "kernel worker returned no RMS measurement");
      }

      // Wallet users pay only after the kernel succeeds. This avoids charging
      // for malformed audio or a failed DSP run while keeping the balance
      // check atomic immediately before fulfillment.
      if (walletMode && !isSample) {
        const spent = await spendCredits(creditUser!.id, walletCost, walletKind, walletReference);
        if (!spent.ok) {
          await updateMasterJob(jobId, {
            status: "failed", stage: "payment_required",
            error: "Insufficient credits to fulfill mastered audio.",
            completedAt: new Date(),
          }).catch(() => {});
          res.status(402).json({
            success: false,
            code: "INSUFFICIENT_CREDITS",
            error: `${mp3Requested ? "MP3" : "WAV"} download costs ${walletCost} credits. You have ${spent.balance}. Buy a credit pack to continue.`,
            creditsRequired: walletCost,
            creditsBalance: spent.balance,
            purchaseUrl: "/pricing#credits",
          });
          return;
        }
        walletSpent = true;
        res.setHeader("X-GK-Credits-Balance", String(spent.balance));
      }

      // Count the free user's first full download against their allowance.
      if (!isSample && usageUserId) {
        if (usedTotalDownloads >= FREE_LIMITS.totalDownloads) {
          await updateMasterJob(jobId, {
            status: "failed", stage: "quota_rejected",
            error: "Download allowance was exhausted before fulfillment.",
            completedAt: new Date(),
          }).catch(() => {});
          res.status(402).json({
            success: false,
            code: "LIMIT_REACHED",
            feature: "master",
            limit: FREE_LIMITS.totalDownloads,
            used: usedTotalDownloads,
            error: "You've used your free download. Subscribe to GravelKing Pro for unlimited masters.",
            fallback: { action: "subscribe", url: "/pricing" },
          });
          return;
        }
        await incrementUsage(usageUserId, "freeMasterDownloads");
        await incrementUsage(usageUserId, "totalDownloads");
      }

      // Paid-tier WAV quota — consumed only after a successful WAV master.
      if (exportUser && !isSample) {
        const quota = await consumeExport(exportUser);
        if (!quota.allowed) {
          if (walletSpent && creditUser) {
            await grantCredits(creditUser.id, walletCost, "quota_master_refund", `refund:${walletReference}`);
            walletSpent = false;
          }
          await updateMasterJob(jobId, {
            status: "failed", stage: "quota_rejected",
            error: "Export quota was exhausted before fulfillment.",
            completedAt: new Date(),
          }).catch(() => {});
          res.status(429).json(exportLimitPayload(quota));
          return;
        }
      }

      // The mastered WAV on disk IS the kernel output — no second carve stage.
      const carvedBuffer = Buffer.from(await readFile(outPath));
      const parity = "MLK_V3.5_PYTHON";

      // Certification is opt-in. Plain masters ship the carved audio untouched —
      // no hash, no watermark, no DB record — so karaoke tracks, covers, and
      // reference mixes master cleanly. Only certify=true gets the full
      // nominator/denominator IP cert split.
      let outBuffer: Buffer = carvedBuffer;
      let certHash: string | null = null;
      let certId: string | null = null;

      if (certify) {
        // Hash the pre-kernel audio — bound to the original mix, not the
        // mastered output (which varies per kernel version).
        const contentHash  = createHash("sha256").update(preKernelBytes).digest("hex");

        // ── Nominator / Denominator cert split ──────────────────────────────
        //   fullHash    = SHA-256(contentHash | artist | certId)
        //   nominator   = fullHash[:32] → embedded in track LSBs
        //   denominator = fullHash[32:] → stored server-side only
        //   handshake   = HMAC(certId|nominator|denominator[|ipi:..|iswc:..|isrc:..], SESSION_SECRET)
        // Industry identifiers (when provided) are sealed into the HMAC so a
        // post-stamp mutation of IPI/ISWC/ISRC revokes the chain of custody.
        // Verification requires BOTH the track and the server record.
        const secret   = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
        certId         = randomUUID();
        const fullHash = createHash("sha256")
          .update(`${contentHash}|${artistHandle}|${certId}`)
          .digest("hex");                          // 64 hex chars
        const nominator   = fullHash.slice(0, 32); // first half → track
        const denominator = fullHash.slice(32);    // second half → server only
        const handshake  = createHmac("sha256", secret)
          .update(`${certId}|${nominator}|${denominator}${industryIdsHmacSegment({ ipiNumber, iswc, isrc })}`)
          .digest("hex");

        // Cert owner — the account (Clerk or gk_session) that stamped this
        // track. Owner-only access to the certificate document is enforced
        // server-side in court-cert.ts; partner API requests carry no user
        // and produce ownerless stubs that fail closed (no doc access).
        const certOwnerId = partnerReq
          ? null
          : (exportUser?.id ?? usageUserId ?? (await getUsageUser(req, res)).id);

        // Store denominator stub on the server — the primary court record.
        // The document itself stays LOCKED until unlocked (one-time $1.99
        // purchase, or a King+ included unlock) — stamping is free.
        await db.insert(ipCertStubsTable).values({
          certId,
          denominator,
          handshake,
          contentHash,
          artist: artistHandle,
          stylePrompt:          rawStylePrompt || null,
          styleAuthorshipScore: styleScore.score,
          ipiNumber,
          iswc,
          isrc,
          ownerUserId: certOwnerId,
          category:    certCategory,
          provenance:  certProvenance,
          // This route only certifies uploaded/recorded audio — never AI
          // generation — so the model attribution is explicitly absent.
          generationModel: null,
          // certify=true implies the ACRCloud screen returned no_match
          // (enforced above); persist that result onto the court record.
          fingerprintStatus: fingerprintStatus,
          fingerprintProvider:
            fingerprintStatus === "local_no_match" ? "local-signature" : "acrcloud",
          fingerprintScannedAt: new Date(),
        }).onConflictDoNothing();

        // Dual-backup to Firestore — independently subpoenable even if
        // GravelKing's own servers are unavailable.
        backupCertStub({
          certId,
          denominator,
          handshake,
          contentHash,
          artist:               artistHandle,
          stylePrompt:          rawStylePrompt || null,
          styleAuthorshipScore: styleScore.score,
          ipiNumber:            ipiNumber ?? undefined,
          iswc:                 iswc ?? undefined,
          isrc:                 isrc ?? undefined,
          certifiedAt:          new Date().toISOString(),
          fingerprintStatus:    fingerprintStatus,
          fingerprintProvider:
            fingerprintStatus === "local_no_match" ? "local-signature" : "acrcloud",
          fingerprintScannedAt: new Date().toISOString(),
        });

        // Embed only the nominator into the track LSBs — no secrets in the file.
        const nominatorPayload = Buffer.from(
          JSON.stringify({ v: 2, id: certId, n: nominator, a: artistHandle })
        );
        outBuffer = embedLsbPayload(carvedBuffer, nominatorPayload);
        certHash = fullHash;
      }

      const filename = `gravelking_mastered_${presetName}.wav`;

      // Store the exact finalized WAV (including an opt-in certificate seal)
      // before any response is sent. /tmp copies remain only for compatibility
      // with existing synchronous/mobile download callers.
      const outputObjectKey = `master-jobs/${jobId}/master.wav`;
      await updateMasterJob(jobId, { progress: 90, stage: "storing_output" });
      await masterJobStorage.savePrivateBuffer(outputObjectKey, outBuffer, "audio/wav", {
        masterJobId: jobId,
        originalFilename: req.file.originalname.slice(0, 255),
      });
      await updateMasterJob(jobId, {
        status: "completed",
        progress: 100,
        stage: "completed",
        outputObjectKey,
        outputUrl: `/api/jobs/${jobId}/download`,
        downloadFilename: filename,
        completedAt: new Date(),
      });

      // ── Real-URL download path ───────────────────────────────────────────
      // Large WAVs delivered as blob: URLs are unreliable on mobile browsers
      // (in-app playback works, but saving the file stalls). Stash a copy and
      // hand the client a real HTTPS URL guarded by a short-lived HMAC token.
      const dlFileId = randomUUID();
      const dlPath   = `/tmp/gk_dl_${dlFileId}.wav`;
      await writeFile(dlPath, outBuffer);
      const dlUrl    = `/api/kernel/master-file?file=${dlFileId}&token=${issueDownloadToken(dlFileId)}&name=${encodeURIComponent(filename)}`;
      sweepStaleDownloads().catch(() => {});

      const setResultHeaders = () => {
        res.setHeader("X-GK-Mode",              "master");
        res.setHeader("X-GK-Preset",            presetName);
        res.setHeader("X-GK-Denoise",           denoise ? "true" : "false");
        res.setHeader("X-GK-Kernel",            "MLK_v3.5");
        res.setHeader("X-GK-Intensity",         String(intensity));
        res.setHeader("X-GK-Sidechain",         sidechainFilter);
        res.setHeader("X-GK-SidechainFreq",     String(sidechainFreq));
        res.setHeader("X-GK-StereoLink",        stereoLink ? "true" : "false");
        res.setHeader("X-GK-AdaptiveMode",      adaptiveMode);
        res.setHeader("X-GK-KernelEngine",      `${kernelEngine}${pyStats.numba ? "-numba" : ""}`);
        if (pyStats.scFreqUsed !== undefined) res.setHeader("X-GK-ScFreqUsed", String(pyStats.scFreqUsed));
        res.setHeader("X-GK-AutoThreshold",     autoThreshold ? "true" : "false");
        if (detectedRmsDb !== null)      res.setHeader("X-GK-DetectedRmsDb",      detectedRmsDb.toFixed(1));
        if (appliedThresholdDb !== null) res.setHeader("X-GK-AppliedThresholdDb", appliedThresholdDb.toFixed(1));
        if (autoThresholdFallback)       res.setHeader("X-GK-AutoThresholdFallback", "true");
        res.setHeader("X-GK-Parity",            parity);
        res.setHeader("X-GK-Certification",     certificationStatus);
        // Measured timing decomposition (ms): multipart upload+parse, kernel
        // processing, and total server time up to response start.
        const reqStart = (res.locals as { requestStartMs?: number }).requestStartMs;
        const uploadMs = (res.locals as { gkUploadMs?: number }).gkUploadMs;
        if (uploadMs !== undefined) res.setHeader("X-GK-Timing-Upload-Ms", uploadMs.toFixed(1));
        if (kernelMs !== null)      res.setHeader("X-GK-Timing-Kernel-Ms", kernelMs.toFixed(1));
        if (reqStart !== undefined) res.setHeader("X-GK-Timing-Server-Ms", (performance.now() - reqStart).toFixed(1));
        res.setHeader("X-GK-Download-Url",      dlUrl);
        if (certHash && certId) {
          res.setHeader("X-GK-Cert-Id",         certId);
          res.setHeader("X-GK-Cert-Hash",       certHash);
          res.setHeader("X-GK-Artist",          artistHandle);
          res.setHeader("X-GK-Style-Score",     String(styleScore.score));
          res.setHeader("X-GK-Style-Eligible",  styleScore.eligible ? "true" : "false");
          res.setHeader("X-GK-Integrity",       "sealed");
        }
      };

      // Both sample and full-length masters stream straight back as audio
      // bytes so the result plays and downloads inside the app — no external
      // storage link, no third-party hand-off.
      if (isSample) {
        if (usageUserId) await incrementUsage(usageUserId, "freeMasterPreviews");
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("X-GK-Sample", "true");
        setResultHeaders();
        streamBuffer(res, outBuffer);
        return;
      }

      if (mp3Requested) {
        const mp3Id = randomUUID();
        const mp3OutPath = `/tmp/gk_master_mp3_${mp3Id}.mp3`;
        try {
          await writeFile(`/tmp/gk_master_mp3_${mp3Id}.wav`, outBuffer);
          await execFileAsync("ffmpeg", [
            "-y", "-i", `/tmp/gk_master_mp3_${mp3Id}.wav`,
            "-acodec", "libmp3lame", "-b:a", "320k", "-ar", "44100",
            mp3OutPath,
          ], { maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
          const mp3Buffer = Buffer.from(await readFile(mp3OutPath));
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/\.wav$/, ".mp3")}"`);
          res.setHeader("X-GK-Format", "mp3");
          res.setHeader("X-GK-Sample", "false");
          setResultHeaders();
          streamBuffer(res, mp3Buffer);
        } finally {
          await unlink(`/tmp/gk_master_mp3_${mp3Id}.wav`).catch(() => {});
          await unlink(mp3OutPath).catch(() => {});
        }
        return;
      }

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-GK-Sample", "false");
      setResultHeaders();
      streamBuffer(res, outBuffer);
    } catch (err: any) {
      await updateMasterJob(jobId, {
        status: "failed",
        stage: "failed",
        error: String(err?.message ?? "Mastering failed.").slice(0, 4000),
        completedAt: new Date(),
      }).catch(() => {});
      if (walletSpent && creditUser) {
        await grantCredits(creditUser.id, walletCost, "failed_master_refund", `refund:${walletReference}`);
      }
      void logToolError("Mastering Tool", "MASTERING", err);
      res.status(500).json({ success: false, error: err.message ?? "Mastering failed." });
    } finally {
      await Promise.all([
        unlink(uploadedPath).catch(() => {}),
        normalizedPath ? unlink(normalizedPath).catch(() => {}) : Promise.resolve(),
        unlink(outPath).catch(() => {}),
      ]);
    }
  }
);

// ── POST /api/kernel/verify-cert ─────────────────────────────────────────────
// Upload a WAV and get back a cert verification result. No auth required —
// this is the public "did this come from GravelKing?" check.
const verifyUpload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) => cb(null, `gkv_${randomUUID()}.${sanitizeExt(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

masterRouter.post(
  "/kernel/verify-cert",
  verifyUpload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ valid: false, error: "No file uploaded." });
      return;
    }
    try {
      const buf     = await readFile(req.file.path);
      const payload = extractLsbPayload(buf);

      if (!payload) {
        res.json({
          valid: false,
          reason: "NO_GKP_WATERMARK",
          note: "No GravelKing watermark found. File may not have been exported from GravelKing, or was re-encoded (lossy re-encode destroys LSB watermarks).",
        });
        return;
      }

      // Parse the nominator from the track
      let parsed: { v: number; id: string; n: string; a: string };
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        res.json({ valid: false, reason: "PAYLOAD_CORRUPT" });
        return;
      }

      const { id: certId, n: nominator, a: artist } = parsed;

      // Look up the server-side denominator stub — only GK server can do this
      const [stub] = await db.select()
        .from(ipCertStubsTable)
        .where(eq(ipCertStubsTable.certId, certId))
        .limit(1);

      if (!stub) {
        res.json({
          valid: false,
          reason: "CERT_NOT_ON_SERVER",
          certId,
          artist,
          note: "Track carries a nominator but no matching server record. The cert was either issued on a different server or the record was deleted.",
        });
        return;
      }

      // Re-derive the full hash and verify the HMAC handshake
      const secret   = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
      const expected = createHmac("sha256", secret)
        .update(`${certId}|${nominator}|${stub.denominator}`)
        .digest("hex");

      if (expected !== stub.handshake) {
        res.json({ valid: false, reason: "HANDSHAKE_MISMATCH", certId, artist });
        return;
      }

      // Verify the nominator matches what was split from the original full hash
      const reconstructed = createHash("sha256")
        .update(`${stub.contentHash}|${stub.artist}|${certId}`)
        .digest("hex");

      if (reconstructed.slice(0, 32) !== nominator) {
        res.json({ valid: false, reason: "NOMINATOR_TAMPERED", certId, artist });
        return;
      }

      res.json({
        valid:       true,
        certId,
        artist:      stub.artist,
        certifiedAt: stub.certifiedAt,
        kernel:      "MLK_v3.5",
        note:        "GravelKing server verified. Nominator (track) + denominator (server) handshake valid.",
      });
    } catch (err: any) {
      res.status(422).json({ valid: false, error: err.message });
    } finally {
      unlink(req.file.path).catch(() => {});
    }
  }
);

// ── Durable mastering job status/download API ──────────────────────────────
// These endpoints deliberately require a resolved database user. Ownerless
// partner jobs have no browser identity to authorize a later read, so they
// retain the synchronous partner response but are not enumerable/downloadable.
masterRouter.get(["/kernel/master-jobs", "/jobs"], async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }
  const jobs = await db.select({
    id: masterJobsTable.id,
    status: masterJobsTable.status,
    progress: masterJobsTable.progress,
    stage: masterJobsTable.stage,
    originalFilename: masterJobsTable.originalFilename,
    downloadFilename: masterJobsTable.downloadFilename,
    error: masterJobsTable.error,
    createdAt: masterJobsTable.createdAt,
    updatedAt: masterJobsTable.updatedAt,
    startedAt: masterJobsTable.startedAt,
    completedAt: masterJobsTable.completedAt,
  }).from(masterJobsTable)
    .where(eq(masterJobsTable.userId, req.dbUser.id))
    .orderBy(desc(masterJobsTable.createdAt))
    .limit(50);
  res.json({ jobs: jobs.map((job) => ({ ...job, jobId: job.id })) });
});

masterRouter.get(["/kernel/master-jobs/:id", "/jobs/:jobId"], async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }
  const id = String(req.params.id ?? req.params.jobId ?? "");
  const [job] = await db.select({
    id: masterJobsTable.id,
    status: masterJobsTable.status,
    progress: masterJobsTable.progress,
    stage: masterJobsTable.stage,
    originalFilename: masterJobsTable.originalFilename,
    requestConfig: masterJobsTable.requestConfig,
    outputObjectKey: masterJobsTable.outputObjectKey,
     outputUrl: masterJobsTable.outputUrl,
    downloadFilename: masterJobsTable.downloadFilename,
    error: masterJobsTable.error,
    createdAt: masterJobsTable.createdAt,
    updatedAt: masterJobsTable.updatedAt,
    startedAt: masterJobsTable.startedAt,
    completedAt: masterJobsTable.completedAt,
  }).from(masterJobsTable)
    .where(and(eq(masterJobsTable.id, id), eq(masterJobsTable.userId, req.dbUser.id)))
    .limit(1);
  if (!job) {
    res.status(404).json({ success: false, error: "Mastering job not found." });
    return;
  }
  const downloadUrl = job.status === "completed" ? `/api/jobs/${job.id}/download` : null;
  res.json({ job: { ...job, jobId: job.id, outputUrl: job.outputUrl ?? downloadUrl }, jobId: job.id, downloadUrl });
});

masterRouter.get(["/kernel/master-jobs/:id/download", "/jobs/:jobId/download"], async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }
  const id = String(req.params.id ?? req.params.jobId ?? "");
  const [job] = await db.select({
    status: masterJobsTable.status,
    outputObjectKey: masterJobsTable.outputObjectKey,
    downloadFilename: masterJobsTable.downloadFilename,
  }).from(masterJobsTable)
    .where(and(eq(masterJobsTable.id, id), eq(masterJobsTable.userId, req.dbUser.id)))
    .limit(1);
  if (!job) {
    res.status(404).json({ success: false, error: "Mastering job not found." });
    return;
  }
  if (job.status !== "completed" || !job.outputObjectKey) {
    res.status(409).json({ success: false, error: "Mastered audio is not ready." });
    return;
  }
  try {
    const file = await masterJobStorage.getObjectEntityFile(`/objects/${job.outputObjectKey}`);
    const [metadata] = await file.getMetadata();
    const safeName = (job.downloadFilename ?? "gravelking_mastered.wav").replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", String(metadata.contentType ?? "audio/wav"));
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    file.createReadStream()
      .on("error", (err) => {
        req.log.error({ err, masterJobId: id }, "durable mastered audio stream failed");
        if (!res.headersSent) res.status(502).json({ success: false, error: "Unable to read mastered audio." });
        else res.destroy(err);
      })
      .pipe(res);
  } catch (err) {
    req.log.error({ err, masterJobId: id }, "durable mastered audio unavailable");
    res.status(502).json({ success: false, error: "Unable to read mastered audio." });
  }
});

// ── GET /api/kernel/master-file ─────────────────────────────────────────────
// Token-guarded (1h TTL) download of a mastered WAV over real HTTPS — mobile
// browsers save this reliably where large blob: URLs stall.
masterRouter.get("/kernel/master-file", async (req: Request, res: Response) => {
  const file  = String(req.query.file ?? "");
  const token = String(req.query.token ?? "");
  const name  = String(req.query.name ?? "gravelking_mastered.wav").replace(/[^\w.-]/g, "_");
  if (!/^[\w-]+$/.test(file) || !verifyDownloadToken(file, token)) {
    res.status(403).json({ success: false, error: "Download link expired or invalid. Run the master again." });
    return;
  }
  const dlPath = `/tmp/gk_dl_${file}.wav`;
  try {
    const buf = await readFile(dlPath);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  } catch {
    res.status(404).json({ success: false, error: "File expired. Run the master again." });
  }
});

export default masterRouter;
