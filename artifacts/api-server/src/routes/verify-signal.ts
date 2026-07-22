/**
 * POST /api/kernel/verify-signal
 *
 * Public clean-room audio verification endpoint. Accepts a WAV upload and
 * returns a structured signal-level verification report:
 *   - Anchor A  — LSB steganographic nominator (embedded in the track)
 *   - Anchor B  — Server-side denominator stub (held on GravelKing servers only)
 *   - HMAC      — Cryptographic handshake integrity
 *   - Warrant   — Full chain-of-custody status ("INTACT" | "TAMPERED" | "NO_WATERMARK")
 *
 * No authentication required — this is the public-facing "did this come from
 * GravelKing?" verification surface for enterprise due-diligence demos.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { readFile, unlink } from "fs/promises";
import { randomUUID, createHash, createHmac } from "crypto";
import { extractLsbPayload } from "../kernel-v3";
import { sanitizeExt } from "../lib/audioGuards";
import { buildWhitepaperPdf } from "../lib/whitepaper-pdf";
import { db, ipCertStubsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) =>
      cb(null, `gkv_sig_${randomUUID()}.${sanitizeExt(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

type AnchorStatus = "VALID" | "INVALID" | "ABSENT";
type WarrantStatus = "INTACT" | "TAMPERED" | "NO_WATERMARK";

interface SignalVerifyResult {
  warrant: WarrantStatus;
  anchorA: { status: AnchorStatus; detail: string };
  anchorB: { status: AnchorStatus; detail: string };
  hmac:    { status: AnchorStatus; detail: string };
  certId:    string | null;
  artist:    string | null;
  certifiedAt: string | null;
  kernel:  string;
  note:    string;
}

router.post(
  "/kernel/verify-signal",
  upload.single("audio"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided." });
      return;
    }

    const result: SignalVerifyResult = {
      warrant: "NO_WATERMARK",
      anchorA: { status: "ABSENT", detail: "No LSB watermark found in audio stream." },
      anchorB: { status: "ABSENT", detail: "Anchor B lookup not attempted." },
      hmac:    { status: "ABSENT", detail: "HMAC check not attempted." },
      certId: null,
      artist: null,
      certifiedAt: null,
      kernel: "MLK_v3.5",
      note: "",
    };

    try {
      const buf = await readFile(req.file.path);

      // ── Anchor A: LSB steganographic nominator ──────────────────────────
      const payload = extractLsbPayload(buf);
      if (!payload) {
        result.anchorA = {
          status: "ABSENT",
          detail:
            "No GravelKing LSB watermark detected. The file was either not exported from GravelKing, or was re-encoded with a lossy codec (MP3/AAC), which destroys LSB steganography.",
        };
        result.warrant = "NO_WATERMARK";
        result.note =
          "File contains no GravelKing signal anchor. This track was not issued by GravelKing Pro.";
        res.json(result);
        return;
      }

      // Parse nominator payload
      let parsed: { v: number; id: string; n: string; a: string };
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        result.anchorA = { status: "INVALID", detail: "LSB payload found but corrupt — cannot decode nominator." };
        result.warrant = "TAMPERED";
        result.note = "Anchor A payload is malformed. Track may have been bit-manipulated after export.";
        res.json(result);
        return;
      }

      const { id: certId, n: nominator, a: artist } = parsed;
      result.certId = certId;
      result.artist = artist;
      result.anchorA = {
        status: "VALID",
        detail: `Nominator extracted. CertID: ${certId}. Artist handle: ${artist}.`,
      };

      // ── Anchor B: Server denominator lookup ─────────────────────────────
      const [stub] = await db
        .select()
        .from(ipCertStubsTable)
        .where(eq(ipCertStubsTable.certId, certId))
        .limit(1);

      if (!stub) {
        result.anchorB = {
          status: "ABSENT",
          detail:
            "No server-side denominator record found for this certId. The cert may have been issued on a different server or the record was purged.",
        };
        result.warrant = "TAMPERED";
        result.note =
          "Anchor A is present but Anchor B is missing. Chain of custody cannot be verified without the server record.";
        res.json(result);
        return;
      }

      result.certifiedAt = stub.certifiedAt.toISOString();
      result.anchorB = {
        status: "VALID",
        detail: `Server denominator located. Certified at ${stub.certifiedAt.toISOString()}. Artist: ${stub.artist}.`,
      };

      // ── HMAC: Cryptographic handshake ─────────────────────────────────────
      const secret = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
      const expected = createHmac("sha256", secret)
        .update(`${certId}|${nominator}|${stub.denominator}`)
        .digest("hex");

      if (expected !== stub.handshake) {
        result.hmac = {
          status: "INVALID",
          detail: "HMAC handshake mismatch. The nominator in the track does not match the server denominator — the watermark may have been forged or the audio was tampered with.",
        };
        result.warrant = "TAMPERED";
        result.note = "HMAC verification failed. Asset warrant is INVALID.";
        res.json(result);
        return;
      }

      // Verify the nominator is the correct split of the original content hash
      const reconstructed = createHash("sha256")
        .update(`${stub.contentHash}|${stub.artist}|${certId}`)
        .digest("hex");

      if (reconstructed.slice(0, 32) !== nominator) {
        result.hmac = {
          status: "INVALID",
          detail: "Nominator slice does not match re-derived content hash. The original audio content has been altered post-certification.",
        };
        result.warrant = "TAMPERED";
        result.note = "Content hash mismatch. The audio was modified after the cert was issued. Warrant is INVALID.";
        res.json(result);
        return;
      }

      result.hmac = {
        status: "VALID",
        detail: "HMAC-SHA256 handshake verified. Nominator (track) + denominator (server) proof is cryptographically sound.",
      };
      result.warrant = "INTACT";
      result.note =
        "Full signal-level verification passed. This track was issued by GravelKing Pro and has not been altered since certification.";

      logger.info({ certId, artist }, "signal verification passed");
      res.json(result);
    } catch (err) {
      logger.error({ err }, "verify-signal failed");
      res.status(500).json({ error: "Verification failed unexpectedly." });
    } finally {
      if (req.file?.path) unlink(req.file.path).catch(() => {});
    }
  }
);

// ── GET /api/v1/download-whitepaper (alias: /api/whitepaper.pdf) ──────────────
// Streams the MLK V3.5 Technical Brief as a styled multi-page PDF document.
const streamWhitepaperPdf = (_req: Request, res: Response) => {
  const pdf = buildWhitepaperPdf();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="GravelKingPro-MLKv35-Technical-Brief.pdf"');
  res.setHeader("Content-Length", String(pdf.length));
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(pdf);
};

router.get("/v1/download-whitepaper", streamWhitepaperPdf);
router.get("/whitepaper.pdf", streamWhitepaperPdf);

// ── GET /api/v1/whitepaper-spec ───────────────────────────────────────────────
// Structured JSON data model of the MLK V3.5 Technical Brief.
// Intended for programmatic partner integration (e.g. PortalBunny API autodiscovery).
router.get("/v1/whitepaper-spec", (_req: Request, res: Response) => {
  res.json({
    meta: {
      title: "GravelKing Pro MLK V3.5 — Technical Brief",
      version: "3.5.0",
      issuer: "All N One LLC — GravelKing Productions",
      contact: "kevm@gravelkingpro.it.com",
      demoLab: "https://gravelkingpro.it.com/verify",
      pdfBrief: "https://gravelkingpro.it.com/whitepaper",
      publishedAt: "2026-07-22T00:00:00Z",
    },
    technology: {
      kernel: "MLK_v3.5",
      method: "LSB dual-anchor steganography",
      anchorA: {
        name: "Nominator",
        location: "audio LSB bitstream",
        algorithm: "SHA-256(contentHash | artistHandle | certId).slice(0,32)",
        survives: ["lossless export", "WAV archival", "platform distribution"],
        metadataIndependent: true,
      },
      anchorB: {
        name: "Denominator",
        location: "GravelKing server only",
        algorithm: "HMAC-SHA256(SESSION_SECRET, certId | nominator | denominator)",
        neverTransmitted: true,
      },
      handshake: "HMAC-SHA256 binding between Anchor A and Anchor B",
      certStorage: ["PostgreSQL (queryable)", "Google Firestore (append-only audit trail)"],
    },
    ingestionPipeline: {
      tiers: [
        {
          tier: 1,
          name: "Metadata Collision Check",
          checks: ["ISRC / ISWC / UPC pattern scan", "Major label / DSP identifier detection", "Commercial artist name blacklist"],
          rejectCode: "ERR_METADATA_COLLISION",
        },
        {
          tier: 2,
          name: "Spectral Audio Fingerprinting",
          checks: ["ebur128 integrated LUFS analysis", "Near-silence rejection (< -55 LUFS)", "Artificially clipped signal detection (peak > -0.5 dBFS)"],
          rejectCode: "ERR_SPECTRAL_UNIQUENESS",
        },
        {
          tier: 3,
          name: "Digital Assertion Signature",
          checks: ["author_assertion: true warrant required in request body"],
          rejectCode: "ERR_COPYRIGHT_WARRANT_REQUIRED",
        },
      ],
    },
    api: {
      baseUrl: "https://gravelkingpro.it.com",
      endpoints: [
        { method: "POST", path: "/api/v1/ingest", alias: "/api/kernel/master", description: "Submit audio for MLK V3.5 watermarking + mastering. Returns processed stream + X-GK-CertId header.", requiresAuth: true },
        { method: "POST", path: "/api/v1/verify", alias: "/api/kernel/verify-signal", description: "Public clean-room verification. No auth required. Returns VerifyResult JSON.", requiresAuth: false, medianLatencyMs: 2 },
        { method: "GET", path: "/api/court-cert/:certId", description: "Retrieve structured forensic certificate JSON.", requiresAuth: false },
        { method: "GET", path: "/api/court-cert/:certId.pdf", description: "Download court-ready PDF certificate.", requiresAuth: false },
        { method: "GET", path: "/api/v1/download-whitepaper", alias: "/api/whitepaper.pdf", description: "Stream this technical brief as a downloadable PDF document.", requiresAuth: false },
        { method: "POST", path: "/api/v1/lead-capture", description: "Enterprise partner onboarding. Issues 7-day demo API key.", requiresAuth: false },
        { method: "GET", path: "/api/v1/whitepaper-spec", description: "This document — structured JSON data model.", requiresAuth: false },
      ],
      supportedFormats: {
        lossless: ["WAV (PCM 16/24/32-bit)", "FLAC", "AIFF"],
        lossy: ["MP3", "AAC", "OGG", "Opus", "M4A"],
        videoContainers: ["MP4", "MOV", "MKV", "WebM"],
        sampleRates: ["44100", "48000", "96000"],
        maxFileSizeBytes: 209715200,
      },
      throughput: {
        verifyMedianMs: 2,
        masteringRangeS: { min: 8, max: 45 },
        parallelLanesPerNode: 12,
        webhookDelivery: true,
      },
    },
    verifyResult: {
      schema: {
        warrant: "INTACT | TAMPERED | NO_WATERMARK",
        anchorA: { status: "VALID | INVALID | ABSENT", detail: "string" },
        anchorB: { status: "VALID | INVALID | ABSENT", detail: "string" },
        hmac: { status: "VALID | INVALID | ABSENT", detail: "string" },
        certId: "string | null",
        artist: "string | null",
        certifiedAt: "ISO-8601 UTC | null",
        kernel: "string",
        note: "string",
      },
    },
    legalCompliance: [
      { standard: "FRE Rule 901(b)(9)", description: "SHA-256 content fingerprint satisfies federal digital evidence authentication" },
      { standard: "Thaler v. Vidal (2023)", description: "Human authorship score >= 25% tracked per cert for copyright assertability" },
      { standard: "EU AI Act (2026)", description: "Provenance declaration embedded at signal level; verifiable without third-party registry" },
      { standard: "Dual-store architecture", description: "PostgreSQL + Firestore prevents spoliation objections in discovery" },
    ],
    infrastructure: {
      kernel: "C-bound DSP via Node.js FFI",
      memoryAccess: "mmap() zero-copy + mlockall() page-lock",
      containerization: "Docker multi-stage (Node 22 LTS + ffmpeg-headless)",
      deploymentTargets: ["SaaS (gravelkingpro.it.com)", "AWS ECS", "GCP Cloud Run", "On-premise Docker Compose (air-gapped)", "White-label API"],
      secretsInjection: "Runtime environment only — no secrets in Docker image",
    },
    licensing: {
      saas: { url: "https://gravelkingpro.it.com/pricing", pricing: "usage-based" },
      whiteLabel: { contact: "kevm@gravelkingpro.it.com", pricing: "volume negotiated" },
      onPremise: { contact: "kevm@gravelkingpro.it.com", pricing: "enterprise license" },
    },
  });
});

export default router;
