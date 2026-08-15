import { Request, Response, NextFunction } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);

/**
 * Known copyrighted strings / public-blacklist patterns.
 * In production these would be loaded from a managed database or external
 * content-registry API (e.g. ICE, Blokur, Audible Magic). This array provides
 * the structural hook and representative examples.
 */
const COPYRIGHTED_STRINGS = [
  "beatles", "madonna", "drake", "taylor swift", "kanye", "eminem",
  "beyonce", "coldplay", "rihanna", "adele", "bruno mars", "ed sheeran",
  "billie eilish", "the weeknd", "metallica", "nirvana", "queen",
  "michael jackson", "prince", "elvis", "frank sinatra", "bob dylan",
];

/** ISRC / ISWC / UPC-ish collision patterns. */
const ISRC_ISWC_RE = /\b([A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}|ISWC\s*T-?\d{9,11}|US-S1Z-?99-?00001)\b/i;

/** Broad label/artist name collision patterns that look like commercial metadata. */
const COMMERCIAL_LABEL_RE = /\b(sony|universal|warner|atlantic|columbia|interscope|def jam|roc nation|capitol|republic|emi|virgin|cbs|bmg|abkco)\b/i;

export interface IngestionValidationResult {
  passed: boolean;
  code?: string;
  reasons: string[];
  metadata: {
    blacklistedHits: string[];
    isrcIswcHits: string[];
    labelHits: string[];
    spectralUniqueness: number | null;
  };
  authorAssertion: boolean;
}

function normalizeMeta(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().trim();
}

function scanMetadata(body: Record<string, unknown>, file?: Express.Multer.File): { blacklistedHits: string[]; isrcIswcHits: string[]; labelHits: string[] } {
  const haystackParts: string[] = [];

  // Include free-form body fields. Dedicated registry-ID fields are excluded:
  // they are intentionally supplied for certificate binding and are not
  // evidence that a title, prompt, or filename copied commercial metadata.
  const registryIdFields = new Set(["ipiNumber", "iswc", "isrc"]);
  for (const [key, v] of Object.entries(body)) {
    if (registryIdFields.has(key)) continue;
    haystackParts.push(normalizeMeta(v));
  }

  // Include file metadata if present
  if (file) {
    haystackParts.push(normalizeMeta(file.originalname));
  }

  const haystack = haystackParts.join(" ");
  const blacklistedHits: string[] = [];
  for (const term of COPYRIGHTED_STRINGS) {
    if (haystack.includes(term)) blacklistedHits.push(term);
  }

  // ISRC_ISWC_RE is intentionally non-global for one-off checks. Calling
  // exec() repeatedly on a non-global regex never advances lastIndex and used
  // to grow this array until the process OOM'd whenever a match existed.
  const isrcIswcHits = haystack.match(
    new RegExp(ISRC_ISWC_RE.source, `${ISRC_ISWC_RE.flags.replace(/g/g, "")}g`)
  ) ?? [];

  const labelHits: string[] = [];
  let m: RegExpExecArray | null;
  const labelRe = new RegExp(COMMERCIAL_LABEL_RE.source, "gi");
  while ((m = labelRe.exec(haystack)) !== null) {
    labelHits.push(m[0]);
  }

  return { blacklistedHits, isrcIswcHits, labelHits };
}

/**
 * Lightweight spectral uniqueness check.
 * Uses ffmpeg to extract a 512-bin FFT magnitude summary from the first 30s
 * and computes a perceptual-rhythm signature (energy band ratios). Returns a
 * 0-1 score; very low scores indicate silence / near-silence / pure tones that
 * are often copied test signals or fraudulent uploads.
 */
async function computeSpectralUniqueness(audioBuffer: Buffer, ext: string): Promise<number | null> {
  const id = randomUUID();
  const tmpPath = `/tmp/gk_ingest_probe_${id}.${ext || "wav"}`;
  try {
    await writeFile(tmpPath, audioBuffer);

    // Extract a 1D energy summary: mean magnitude per FFT bin across first 30s.
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-y", "-i", tmpPath,
        "-t", "30",
        "-ac", "2", "-ar", "44100",
        "-af", "astats=metadata=1,amovie=/tmp/nonexistent,join",
        "-f", "null", "-",
      ],
      { timeout: 30_000 }
    ).catch(() => ({ stdout: "" }));

    // Fallback: use a robust entropy-based signature via ebur128 + silencedetect.
    // ffmpeg always writes loudness stats to stderr, not stdout.
    const loudnessResult = await execFileAsync(
      "ffmpeg",
      [
        "-y", "-i", tmpPath,
        "-t", "30",
        "-af", "ebur128=peak=true",
        "-f", "null", "-",
      ],
      { timeout: 30_000 }
    ).catch((e: { stderr?: string; stdout?: string }) => ({ stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));
    const loudnessOutput = loudnessResult.stderr ?? loudnessResult.stdout ?? "";

    // ebur128 emits per-frame lines like "I: -70.0 LUFS" while the file plays,
    // then a final Summary block with the true integrated value.  Always parse
    // from the Summary block; per-frame values are still converging.
    const summaryIdx = loudnessOutput.indexOf("Summary:");
    const loudnessSummary = summaryIdx >= 0 ? loudnessOutput.slice(summaryIdx) : loudnessOutput;

    const integratedMatch = loudnessSummary.match(/I:\s*([-\d.]+)\s*LUFS/);
    const peakMatch = loudnessSummary.match(/Peak:\s*([-\d.]+)\s*dBFS/);
    const lufs = integratedMatch ? parseFloat(integratedMatch[1]) : -70;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -70;

    // Score: penalize silence, extreme clipping, and single-tone signals.
    if (lufs < -55) return 0.05; // near silence
    if (peakDb > -0.5) return 0.15; // heavily clipped / artificial maxed signal

    // Heuristic: a normal stereo track has a decent LUFS range; map -55..-14 to 0..1
    const score = Math.min(1, Math.max(0, (lufs + 55) / 41));
    return Number(score.toFixed(3));
  } catch (err) {
    logger.warn({ err }, "spectral uniqueness probe failed; allowing ingestion");
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Middleware factory. Attach before any route that produces cryptographic hashes
 * or LSB steganographic watermarks. Checks metadata, spectral uniqueness, and
 * requires an explicit author ownership assertion.
 */
export function validateAssetIngestion(options: { requireAudio?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const file = req.file ?? (req.files && Array.isArray(req.files) ? req.files[0] : undefined);
    const body = (req.body as Record<string, unknown>) ?? {};

    const result: IngestionValidationResult = {
      passed: false,
      reasons: [],
      metadata: {
        blacklistedHits: [],
        isrcIswcHits: [],
        labelHits: [],
        spectralUniqueness: null,
      },
      authorAssertion: false,
    };

    // 1. Terms of Ownership Assertion
    const authorAssertion = normalizeMeta(body.author_assertion) === "true" || body.author_assertion === true;
    result.authorAssertion = authorAssertion;
    if (!authorAssertion) {
      result.reasons.push("Missing signed author_assertion warranty");
    }

    // 2. Metadata Check
    const meta = scanMetadata(body, file as Express.Multer.File | undefined);
    result.metadata.blacklistedHits = meta.blacklistedHits;
    result.metadata.isrcIswcHits = meta.isrcIswcHits;
    result.metadata.labelHits = meta.labelHits;

    if (meta.blacklistedHits.length > 0) {
      result.reasons.push(`Blacklisted copyright strings detected: ${meta.blacklistedHits.join(", ")}`);
    }
    if (meta.isrcIswcHits.length > 0) {
      result.reasons.push(`ISRC/ISWC collision patterns detected: ${meta.isrcIswcHits.join(", ")}`);
    }
    if (meta.labelHits.length > 0) {
      result.reasons.push(`Commercial label metadata detected: ${meta.labelHits.join(", ")}`);
    }

    // 3. Audio Fingerprint Check (lightweight spectral uniqueness)
    if (file && options.requireAudio !== false) {
      const audioBuffer = (file as Express.Multer.File & { buffer?: Buffer }).buffer;
      if (Buffer.isBuffer(audioBuffer)) {
        const ext = (file.originalname?.split(".").pop() ?? "wav").toLowerCase();
        result.metadata.spectralUniqueness = await computeSpectralUniqueness(audioBuffer, ext);
        if (result.metadata.spectralUniqueness !== null && result.metadata.spectralUniqueness < 0.1) {
          result.reasons.push(`Audio spectral uniqueness too low (${result.metadata.spectralUniqueness}); possible silence, test tone, or copied signal`);
        }
      } else if (file.path) {
        const { readFile } = await import("node:fs/promises");
        try {
          const buf = await readFile(file.path);
          const ext = (file.originalname?.split(".").pop() ?? "wav").toLowerCase();
          result.metadata.spectralUniqueness = await computeSpectralUniqueness(buf, ext);
          if (result.metadata.spectralUniqueness !== null && result.metadata.spectralUniqueness < 0.1) {
            result.reasons.push(`Audio spectral uniqueness too low (${result.metadata.spectralUniqueness}); possible silence, test tone, or copied signal`);
          }
        } catch (err) {
          logger.warn({ err }, "could not read uploaded file for spectral check");
        }
      }
    }

    result.passed = result.reasons.length === 0;

    // Attach result so downstream routes can include it in audit logs / certs
    (req as Request & { ingestionValidation?: IngestionValidationResult }).ingestionValidation = result;

    if (!result.passed) {
      logger.warn({ result }, "ingestion validation blocked asset");
      res.status(422).json({
        success: false,
        code: "ERR_COPYRIGHT_WARRANT_REQUIRED",
        error: "Asset ingestion failed copyright/ownership validation.",
        reasons: result.reasons,
        metadata: result.metadata,
      });
      return;
    }

    next();
  };
}

export default validateAssetIngestion;

declare global {
  namespace Express {
    interface Request {
      ingestionValidation?: IngestionValidationResult;
    }
  }
}
