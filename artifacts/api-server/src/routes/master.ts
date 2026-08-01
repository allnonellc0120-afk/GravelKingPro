import { Router, Request, Response, NextFunction } from "express";
import { streamBuffer } from "../lib/streamResponse";
import multer from "multer";
import { unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID, createHash, createHmac } from "crypto";
import { rateLimit } from "../lib/rateLimiter";
import { isAdminAuthenticated } from "../lib/adminAuth";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { probeFileDuration, sanitizeExt, normalizeToWav, MAX_AUDIO_DURATION_S } from "../lib/audioGuards";
import { hasUnlimitedMasters } from "../lib/entitlement";
import { getUsageUser, incrementUsage, FREE_LIMITS } from "../lib/usage";
import { applyMLKv3Fast, embedLsbPayload, extractLsbPayload } from "../kernel-v3";
import { readFile } from "fs/promises";
import { db, ipCertStubsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { styleAuthorshipScore } from "@workspace/authorship";
import { backupCertStub } from "../lib/firestore";
import { logToolError } from "../lib/errorTracker";
import { recordActivity } from "../lib/activityTracker";
import { validateAssetIngestion } from "../middlewares/validateAssetIngestion";

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

const masterRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 10 });
const masterConcurrency = concurrencyLimit(3);

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
    label: "Spacious",
    description: "Baseline + reverb & stereo space maker for width and depth.",
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
    label: "Vinyl",
    description: "Baseline + warm analog boost for lows and subtle air.",
    filter: "bass=g=3,treble=g=1,loudnorm=I=-16:TP=-1:LRA=13",
  },
  podcast: {
    label: "Podcast",
    description: "Baseline + highpass + dynamic compression for speech clarity.",
    filter:
      "bass=g=1,highpass=f=100,compand=attacks=0.01:decays=0.1:points=-70/-70|-30/-25|0/-5|20/-5,loudnorm=I=-16:TP=-1.5:LRA=11",
  },
  club: {
    label: "Club",
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
    label: "YouTube",
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
    void validateAssetIngestion({ requireAudio: true })(req, res, next);
    return;
  }
  next();
};

masterRouter.post(
  "/kernel/master",
  masterRateLimit,
  masterConcurrency,
  upload.single("audio"),
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

    const presetName    = (req.body.preset as string) || "baseline";
    if (!VALID_PRESETS.has(presetName)) {
      res.status(400).json({ success: false, error: `Unknown preset "${presetName}".` });
      return;
    }

    // Intensity 0–100 (default 75). Scales EQ gains and the MLK kernel
    // multiplier so the user can dial from subtle polish to maximum impact.
    const rawIntensity = parseFloat((req.body.intensity as string) || "75");
    const intensity    = Math.min(100, Math.max(0, isNaN(rawIntensity) ? 75 : rawIntensity));
    const S            = intensity / 100;          // 0.0 – 1.0 scale factor

    const preset          = MASTER_PRESETS[presetName as MasterPreset];
    const denoise         = (req.body.denoise as string) === "true";

    // Sidechain compressor params — mirrors MorrisLawKernel.process() signature.
    // sidechainFilter: 'highpass' | 'lowpass' | 'none'  (default 'highpass')
    // sidechainFreq:   Hz for the detector HPF/LPF        (default 160)
    // stereoLink:      both channels track same GR        (default true)
    const rawScFilter = (req.body.sidechainFilter as string) || "highpass";
    const sidechainFilter: "highpass" | "lowpass" | "none" =
      rawScFilter === "lowpass" ? "lowpass" : rawScFilter === "none" ? "none" : "highpass";
    const sidechainFreq = Math.min(2000, Math.max(20,
      parseFloat((req.body.sidechainFreq as string) || "160") || 160
    ));
    const stereoLink = (req.body.stereoLink as string) !== "false";
    // adaptive_mode: 'bass_aware' bandpasses the sidechain detector around the
    // bass range (sidechainFreq × 0.5 – × 2.5) + dynaudnorm so the compressor
    // tracks bass energy, not broadband level. 'off' = fixed detector filter.
    const rawAdaptive = (req.body.adaptiveMode as string) || "bass_aware";
    const adaptiveMode: "off" | "bass_aware" = rawAdaptive === "off" ? "off" : "bass_aware";

    // auto_threshold: run a quick volumedetect pass and set threshold =
    // (mean RMS dBFS + offset). Saves the user from guessing numeric values.
    const autoThreshold       = (req.body.autoThreshold as string) === "true";
    const rawOffset           = parseFloat((req.body.autoThresholdOffset as string) || "-16");
    const autoThresholdOffset = Math.min(-6, Math.max(-30, isNaN(rawOffset) ? -16 : rawOffset));

    // ── Auto-threshold probe ─────────────────────────────────────────────────
    // Probes RMS of the SAME detector key chain the compressor will use, so
    // threshold = detector_rms_db + offset_db is coherent with what
    // sidechaincompress actually sees. Returns ok=false when the probe fails
    // so the caller can fall back loudly instead of silently.
    const probeDetectorRms = async (
      path: string, keyChain: string,
    ): Promise<{ rmsDb: number; ok: boolean }> => {
      try {
        // ffmpeg writes volumedetect output to stderr; process exits 0.
        const { stderr } = await execFileAsync("ffmpeg", [
          "-i", path, "-af", `${keyChain},volumedetect`, "-f", "null", "/dev/null",
        ], { maxBuffer: 512 * 1024, timeout: 30_000 }).catch((e: any) =>
          ({ stderr: (e?.stderr as string) ?? "" })
        );
        const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
        if (!match) return { rmsDb: -18.0, ok: false };
        return { rmsDb: parseFloat(match[1]), ok: true };
      } catch {
        return { rmsDb: -18.0, ok: false };
      }
    };

    // certify=true → copyright/ownership validation (runs in middleware) plus
    // an embedded IP cert. Default false → master any track, no watermark.
    const certify      = (req.body.certify as string) === "true";
    // Artist handle attached to every cert
    const artistHandle = ((req.body.artist as string) || "Unknown Artist")
      .trim().slice(0, 64).replace(/[^\w\s@._-]/g, "");
    // Style prompt — human creative direction for the instrumental
    const rawStylePrompt = ((req.body.stylePrompt as string) || "").trim().slice(0, 1000);
    const styleScore     = styleAuthorshipScore(rawStylePrompt);

    // weekly+ tiers get unlimited full-length masters. Free users get one full
    // download, then 30-second previews thereafter.
    const unlimited = await hasUnlimitedMasters(req);
    let isSample = false;
    let usageUserId: string | null = null;
    let usedTotalDownloads = 0;
    if (!unlimited) {
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

    const uploadedPath = req.file.path;
    let filePath = uploadedPath;
    let normalizedPath: string | null = null;
    const outPath = `/tmp/gk_master_out_${randomUUID()}.wav`;

    try {
      // Normalize any format (m4a, mp4, mov, ogg, webm…) → WAV before the
      // preset chain. ffmpeg auto-detects the container so the user can drop
      // anything from their photo library and have it just work.
      normalizedPath = await normalizeToWav(uploadedPath);
      filePath = normalizedPath;

      // Duration guard
      const duration = await probeFileDuration(filePath);
      if (duration > MAX_AUDIO_DURATION_S) {
        res.status(422).json({
          success: false,
          error: `Audio exceeds the maximum allowed duration of ${Math.floor(MAX_AUDIO_DURATION_S / 60)} minutes.`,
        });
        return;
      }

      // ── Scale EQ gains by intensity ────────────────────────────────────────
      // bass=g=N → bass=g=(N×S), treble=g=N → treble=g=(N×S)
      const scaleFilter = (f: string, s: number) =>
        f.replace(/\b(bass|treble)=g=(-?[\d.]+)/g, (_m, eq, g) =>
          `${eq}=g=${(parseFloat(g) * s).toFixed(3)}`
        );
      const scaledPreset = S >= 0.99 ? preset.filter : scaleFilter(preset.filter, S);
      const preChain     = denoise ? `${DENOISE_FILTER},` : "";

      // ── Build the ffmpeg argument set ──────────────────────────────────────
      // When sidechain is active we need filter_complex (split → detector →
      // sidechaincompress → preset EQ chain → out).  Plain chain uses -af.
      let ffmpegArgs: string[];
      // Observability for the response headers / UI readout.
      let detectedRmsDb: number | null = null;
      let appliedThresholdDb: number | null = null;
      let autoThresholdFallback = false;

      if (sidechainFilter === "none") {
        // No sidechain — simple linear -af chain.
        ffmpegArgs = [
          "-y", "-i", filePath,
          ...(isSample ? ["-t", "30"] : []),
          "-af", `${preChain}${scaledPreset}`,
          "-acodec", "pcm_s16le", "-ar", "44100", outPath,
        ];
      } else {
        // ── Sidechain compressor via filter_complex ───────────────────────
        // Detector key signal:
        //   bass_aware → bandpass (sidechainFreq×0.5 – sidechainFreq×2.5) +
        //                dynaudnorm so it tracks bass energy, not broadband.
        //   off        → fixed HPF or LPF at sidechainFreq.
        let scKeyChain: string;
        if (adaptiveMode === "bass_aware") {
          const loFreq = Math.max(20, Math.round(sidechainFreq * 0.5));
          const hiFreq = Math.min(20000, Math.round(sidechainFreq * 2.5));
          scKeyChain = `highpass=f=${loFreq},lowpass=f=${hiFreq},dynaudnorm=p=0.95:m=5:s=3`;
        } else {
          scKeyChain = `${sidechainFilter}=f=${sidechainFreq}`;
        }

        // Threshold: probe RMS of the SAME key chain the compressor will use
        // (so bass_aware's bandpass+normalisation is accounted for). On probe
        // failure we fall back to the conservative -26 dBFS default and flag it
        // in the response headers + logs instead of failing silently.
        let threshold = 0.05; // ≈ -26 dBFS conservative default
        if (autoThreshold) {
          const probe = await probeDetectorRms(filePath, scKeyChain);
          if (probe.ok) {
            detectedRmsDb = probe.rmsDb;
            const threshDb = Math.min(-3, Math.max(-60, probe.rmsDb + autoThresholdOffset));
            appliedThresholdDb = threshDb;
            threshold = Math.min(0.9, Math.max(0.001, Math.pow(10, threshDb / 20)));
          } else {
            autoThresholdFallback = true;
            req.log.warn({ autoThresholdOffset }, "auto-threshold RMS probe failed; using default threshold");
          }
        }

        // Stereo link: ffmpeg's `link` option controls whether the average
        // level across channels (linked, mastering-safe) or the louder channel
        // (more independent) drives gain reduction.
        const scLink   = stereoLink ? "average" : "maximum";
        const scFilter = `sidechaincompress=threshold=${threshold.toFixed(5)}:ratio=2.5:attack=10:release=150:link=${scLink}`;

        const graph = [
          `asplit=2[sc][main]`,
          `[sc]${scKeyChain}[key]`,
          `[main][key]${scFilter}[scc]`,
          `[scc]${preChain}${scaledPreset}[out]`,
        ].join(";");

        ffmpegArgs = [
          "-y", "-i", filePath,
          ...(isSample ? ["-t", "30"] : []),
          "-filter_complex", graph,
          "-map", "[out]",
          "-ac", "2", "-acodec", "pcm_s16le", "-ar", "44100", outPath,
        ];
      }

      await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 100 * 1024 * 1024, timeout: 120_000 });

      // Count the free user's first full download against their allowance.
      if (!isSample && usageUserId) {
        if (usedTotalDownloads >= FREE_LIMITS.totalDownloads) {
          res.status(402).json({
            success: false,
            code: "LIMIT_REACHED",
            feature: "master",
            limit: FREE_LIMITS.totalDownloads,
            used: usedTotalDownloads,
            error: "You've used your free download. Subscribe to GravelKing Weekly for unlimited masters.",
            fallback: { action: "subscribe", url: "/pricing" },
          });
          return;
        }
        await incrementUsage(usageUserId, "freeMasterDownloads");
        await incrementUsage(usageUserId, "totalDownloads");
      }

      // Carve the mastered output through the MLK v3 kernel.
      // Multiplier scales linearly with intensity: 0.10 at minimum → 0.75 at
      // full blast, matching the Python kernel's 0–100 intensity parameter.
      const mlkMultiplier = 0.10 + 0.65 * S;
      const { buf: carvedBuffer, parity } = await applyMLKv3Fast(outPath, mlkMultiplier);

      // Certification is opt-in. Plain masters ship the carved audio untouched —
      // no hash, no watermark, no DB record — so karaoke tracks, covers, and
      // reference mixes master cleanly. Only certify=true gets the full
      // nominator/denominator IP cert split.
      let outBuffer = carvedBuffer;
      let certHash: string | null = null;
      let certId: string | null = null;

      if (certify) {
        // Hash the normalized pre-MLK audio — bound to the original mix, not the
        // MLK-carved output (which varies per kernel version).
        const preMlkBytes  = await readFile(outPath);
        const contentHash  = createHash("sha256").update(preMlkBytes).digest("hex");

        // ── Nominator / Denominator cert split ──────────────────────────────
        //   fullHash    = SHA-256(contentHash | artist | certId)
        //   nominator   = fullHash[:32] → embedded in track LSBs
        //   denominator = fullHash[32:] → stored server-side only
        //   handshake   = HMAC(certId|nominator|denominator, SESSION_SECRET)
        // Verification requires BOTH the track and the server record.
        const secret   = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
        certId         = randomUUID();
        const fullHash = createHash("sha256")
          .update(`${contentHash}|${artistHandle}|${certId}`)
          .digest("hex");                          // 64 hex chars
        const nominator   = fullHash.slice(0, 32); // first half → track
        const denominator = fullHash.slice(32);    // second half → server only
        const handshake  = createHmac("sha256", secret)
          .update(`${certId}|${nominator}|${denominator}`)
          .digest("hex");

        // Store denominator stub on the server — the primary court record.
        await db.insert(ipCertStubsTable).values({
          certId,
          denominator,
          handshake,
          contentHash,
          artist: artistHandle,
          stylePrompt:          rawStylePrompt || null,
          styleAuthorshipScore: styleScore.score,
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
          certifiedAt:          new Date().toISOString(),
        });

        // Embed only the nominator into the track LSBs — no secrets in the file.
        const nominatorPayload = Buffer.from(
          JSON.stringify({ v: 2, id: certId, n: nominator, a: artistHandle })
        );
        outBuffer = embedLsbPayload(carvedBuffer, nominatorPayload);
        certHash = fullHash;
      }

      const filename = `gravelking_mastered_${presetName}.wav`;

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
        res.setHeader("X-GK-AutoThreshold",     autoThreshold ? "true" : "false");
        if (detectedRmsDb !== null)      res.setHeader("X-GK-DetectedRmsDb",      detectedRmsDb.toFixed(1));
        if (appliedThresholdDb !== null) res.setHeader("X-GK-AppliedThresholdDb", appliedThresholdDb.toFixed(1));
        if (autoThresholdFallback)       res.setHeader("X-GK-AutoThresholdFallback", "true");
        res.setHeader("X-GK-Parity",            parity);
        if (certHash && certId) {
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

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-GK-Sample", "false");
      setResultHeaders();
      streamBuffer(res, outBuffer);
    } catch (err: any) {
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

export default masterRouter;
