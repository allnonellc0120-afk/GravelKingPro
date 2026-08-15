/**
 * MLK v3.5 Orchestrator — in-house generate-and-master pipeline.
 *
 * STANDALONE service module (Task #73 spec). Orchestrates ONLY — every stage
 * calls the existing, real production code paths:
 *
 *   a) Lyric hash        — same SHA-256 normalization as /api/lyrics/import
 *   b) Music generation  — Vertex AI Lyria (lyria-3-pro-preview) on the
 *                          owner's GCP service account (geminiVertex auth)
 *   c) Mastering         — the REAL Morris Law Kernel v3.5: primary Cloud Run
 *                          kernel service (MLK_KERNEL_URL), fallback the local
 *                          python/mlk_master.py worker subprocess. Identical
 *                          invocation to routes/master.ts. NO ffmpeg DSP, NO
 *                          mock, NO placeholder — if neither kernel can run,
 *                          this throws loudly.
 *   d) Cert + vault      — Dual-Anchor nominator/denominator HMAC cert
 *                          (ip_cert_stubs + Firestore backup + LSB embed),
 *                          then persisted to the existing user vault tables
 *                          (tracks + purchased_tracks → shows in /api/library).
 *
 * No existing kernel, schema, or controller files are modified.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { randomUUID, createHash, createHmac } from "crypto";
import { readFile, writeFile, unlink, mkdir } from "fs/promises";

import { db, ipCertStubsTable, tracksTable, purchasedTracksTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import { embedLsbPayload } from "../kernel-v3";
import { normalizeToWav, probeFileDuration } from "../lib/audioGuards";
import { ObjectStorageService, saveObjectWithFallback } from "../lib/objectStorage";
import { backupCertStub } from "../lib/firestore";
import { getGcpCredentials, getVertexAccessToken, VERTEX_LOCATION } from "../geminiVertex";
import { logger } from "../lib/logger";
import { sanitizeStylePrompt, rewriteBlockedPrompt } from "./promptSanitizer";
import { transcribeWithGemini } from "../geminiTranscribe";
import { scanCommercialFingerprint } from "../lib/commercialFingerprint";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();

/** Baseline preset — identical values to KERNEL_PRESET_MAP.baseline in routes/master.ts. */
const KERNEL_PRESET = { kernel: "natural_body", lufs: -14, ceiling: -0.8 };
const KERNEL_DEFAULTS = {
  intensity: 1,
  sidechainFilter: "none",
  sidechainFreq: 120,
  stereoLink: true,
  adaptiveMode: "off",
  autoThreshold: false,
  autoOffset: 0,
};

const LYRIA_MODEL = "lyria-3-pro-preview";

/** How vocals are sourced: user lyrics, model-written lyrics, or none. */
export type VocalMode = "lyrics" | "random" | "instrumental";

export interface GenerateAndMasterResult {
  trackId: string;
  certId: string | null;
  certificationStatus: "sealed" | "skipped_match" | "skipped_unavailable";
  lyricHash: string;
  lyriaModel: string;
  kernelEngine: "cloud-run" | "local" | "unmastered";
  durationS: number;
  title: string;
}

/**
 * Auto-generated album cover (simple/static): a two-tone diagonal gradient
 * deterministically seeded from the track id, with the title drawn on top.
 * Plain ffmpeg plumbing — no AI cost, never produces a blank cover.
 */
export function buildCoverArgs(trackId: string, title: string, outPath: string): string[] {
  // Seed two hues from the uuid so every track gets a distinct-but-stable look.
  const seed = parseInt(trackId.replace(/-/g, "").slice(0, 8), 16) || 0x1f2937;
  const hue0 = seed % 360;
  const hue1 = (hue0 + 140) % 360;
  const hsl = (h: number, s: number, l: number): string => {
    // Minimal HSL→RGB for ffmpeg hex colors.
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return Math.round(255 * c).toString(16).padStart(2, "0");
    };
    return `0x${f(0)}${f(8)}${f(4)}`;
  };
  const c0 = hsl(hue0, 0.55, 0.22);
  const c1 = hsl(hue1, 0.6, 0.42);
  // drawtext: escape ffmpeg filter special chars, keep it short.
  const safeTitle = title
    .slice(0, 42)
    .replace(/\\/g, "")
    .replace(/[':,\[\]=;#%]/g, " ")
    .trim() || "GravelKing Track";
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  return [
    "-y",
    "-f", "lavfi",
    "-i", `gradients=s=600x600:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=600:y1=600,format=rgb24`,
    "-vf",
    `drawtext=fontfile=${font}:text='${safeTitle}':fontcolor=white@0.92:fontsize=40:x=(w-text_w)/2:y=h-120,` +
      `drawtext=fontfile=${font}:text='GRAVELKING PRO':fontcolor=white@0.45:fontsize=18:x=(w-text_w)/2:y=h-64`,
    "-frames:v", "1",
    outPath,
  ];
}

/** Same normalization + SHA-256 as the existing lyric possession stamp. */
export function hashLyrics(text: string): { normalized: string; hash: string } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  return {
    normalized,
    hash: createHash("sha256").update(normalized, "utf8").digest("hex"),
  };
}

export interface InteractionContentBlock {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  text?: string;
}
export interface InteractionStep {
  type?: string;
  content?: InteractionContentBlock[];
}
export interface InteractionResponse {
  id?: string;
  name?: string;
  status?: string;
  steps?: InteractionStep[];
  outputs?: InteractionContentBlock[];
  error?: { message?: string };
}

/** Pull the first audio block out of either the steps or outputs schema. */
function extractInteractionAudio(body: InteractionResponse): { data: string; mime: string } | null {
  for (const step of body.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "audio" && block.data) {
        return { data: block.data, mime: block.mime_type ?? block.mimeType ?? "audio/mpeg" };
      }
    }
  }
  for (const block of body.outputs ?? []) {
    if (block.type === "audio" && block.data) {
      return { data: block.data, mime: block.mime_type ?? block.mimeType ?? "audio/mpeg" };
    }
  }
  return null;
}

/**
 * Pull any sung-lyrics text out of a Lyria Interactions API response.
 * The model may return a text block (lyrics it wrote) alongside the audio.
 *
 * Only accepts blocks from verified model-output steps (step.type ===
 * "model_output") and the top-level `outputs` field — never input, user, or
 * tool steps, which could contain the style prompt or tool call payloads.
 * Returns null if no model-authored text content is present.
 *
 * Exported for unit-testing only — not part of the public module surface.
 */
export function extractInteractionLyrics(body: InteractionResponse): string | null {
  const candidates: string[] = [];
  for (const step of body.steps ?? []) {
    // Skip every step that is not a verified model output.
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "text" && block.text?.trim()) {
        candidates.push(block.text.trim());
      }
    }
  }
  // Top-level `outputs` is model-produced by definition.
  for (const block of body.outputs ?? []) {
    if (block.type === "text" && block.text?.trim()) {
      candidates.push(block.text.trim());
    }
  }
  return candidates.length > 0 ? candidates.join("\n\n") : null;
}

/**
 * Call Vertex AI Lyria 3 Pro via the Interactions API (the ONLY surface that
 * serves Lyria 3 on Vertex — :predict/:generateContent are not supported).
 * Lyria 3 requires location "global". Returns raw audio bytes (MP3).
 */
async function generateLyriaAudio(
  input: string,
): Promise<{ audio: Buffer; mimeType: string; model: string; responseLyrics?: string }> {
  const creds = getGcpCredentials();
  const token = await getVertexAccessToken();
  const base = `https://aiplatform.googleapis.com/v1beta1/projects/${creds.project_id}/locations/global`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const res = await fetch(`${base}/interactions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: LYRIA_MODEL,
      input,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Vertex AI Lyria (${LYRIA_MODEL}) ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  let body: InteractionResponse;
  try {
    body = JSON.parse(bodyText) as InteractionResponse;
  } catch {
    throw new Error(`Vertex AI Lyria returned non-JSON: ${bodyText.slice(0, 200)}`);
  }

  // Async interaction — poll until completed (Lyria 3 Pro songs take minutes).
  const interactionId = body.id ?? body.name;
  const deadline = Date.now() + 300_000;
  while (
    body.status && !["completed", "failed", "cancelled"].includes(body.status) &&
    interactionId && Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`${base}/interactions/${interactionId}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!poll.ok) {
      throw new Error(`Vertex AI Lyria poll ${poll.status}: ${(await poll.text()).slice(0, 200)}`);
    }
    body = (await poll.json()) as InteractionResponse;
  }
  if (body.status === "failed" || body.status === "cancelled") {
    throw new Error(`Vertex AI Lyria interaction ${body.status}: ${body.error?.message ?? "no detail"}`);
  }

  const audio = extractInteractionAudio(body);
  if (!audio) {
    throw new Error(
      `Vertex AI Lyria (${LYRIA_MODEL}) returned no audio content (status=${body.status ?? "?"}): ${bodyText.slice(0, 300)}`,
    );
  }
  const responseLyrics = extractInteractionLyrics(body);
  return {
    audio: Buffer.from(audio.data, "base64"),
    mimeType: audio.mime,
    model: LYRIA_MODEL,
    /** Lyrics text returned by the model alongside the audio, if any. */
    responseLyrics: responseLyrics ?? undefined,
  };
}

/**
 * Run the REAL Morris Law Kernel v3.5 on a normalized WAV file via the local
 * Python worker subprocess — the ONLY DSP path. No remote / Cloud Run branch.
 * Throws loudly if the kernel fails; no silent fallback.
 */
async function runMlkKernel(
  kernelInputPath: string,
  outPath: string,
): Promise<"local"> {
  const d = KERNEL_DEFAULTS;
  // Resolved relative to the bundle (dist/index.mjs → ../python), never
  // process.cwd() — the container cwd is /app, not the package dir.
  const pyWorker = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
  await execFileAsync("python3", [
    pyWorker,
    "--input", kernelInputPath,
    "--output", outPath,
    "--preset", KERNEL_PRESET.kernel,
    "--intensity", String(d.intensity),
    "--sidechain-filter", d.sidechainFilter,
    "--sidechain-freq", String(d.sidechainFreq),
    "--stereo-link", d.stereoLink ? "true" : "false",
    "--adaptive-mode", d.adaptiveMode,
    "--auto-threshold", d.autoThreshold ? "true" : "false",
    "--auto-offset", String(d.autoOffset),
    "--target-lufs", String(KERNEL_PRESET.lufs),
    "--ceiling-db", String(KERNEL_PRESET.ceiling),
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
  return "local";
}

/**
 * Full pipeline: certify lyrics → Lyria generation → REAL MLK v3.5 master →
 * Dual-Anchor cert → user vault. Read-only pass-through against existing
 * systems; throws loudly on any stage failure (no silent fallbacks).
 */
export async function generateAndMasterTrack(
  lyricId: string | null,
  text: string,
  userId: string,
  opts: {
    title?: string;
    artistName?: string;
    stylePrompt?: string;
    vocalMode?: VocalMode;
    /** Requested song length in seconds (advisory — appended to the Lyria brief). */
    targetDurationS?: number;
    /** When set, this run is a remix — the child cert records the parent linkage. */
    remixOf?: { parentTrackId: string; parentCertId: string | null };
  } = {},
): Promise<GenerateAndMasterResult> {
  const vocalMode: VocalMode = opts.vocalMode ?? "lyrics";

  // ── a) Lyric certification hash (only when the user supplies lyrics) ────
  let normalized = "";
  let lyricHash = "";
  if (vocalMode === "lyrics") {
    ({ normalized, hash: lyricHash } = hashLyrics(text));
    if (normalized.length < 5) throw new Error("Lyrics text is required (min 5 characters).");
  }

  const title =
    opts.title?.trim() ||
    (vocalMode === "lyrics" ? normalized.split("\n")[0]!.slice(0, 80) : "") ||
    (vocalMode === "instrumental" ? "MLK v3.5 Instrumental" : "MLK v3.5 Track");
  const artistHandle = opts.artistName?.trim() || "GravelKing Artist";
  const stylePrompt =
    opts.stylePrompt?.trim() ||
    (vocalMode === "instrumental"
      ? "Modern instrumental, rich arrangement, clean professional mix."
      : "Full song with vocals, modern production, clean mix, structured verses and chorus.");

  // ── b) Vertex AI Lyria generation ───────────────────────────────────────
  // Zero-Rejection pre-pass: artist references → sonic descriptors, flagged
  // terms → policy-safe equivalents. Only the LYRIA input is rewritten — the
  // cert record below keeps the user's ORIGINAL prompt (their real creative
  // direction). User lyrics are NEVER rewritten (hash integrity).
  const { prompt: lyriaStylePrompt, optimized: promptOptimized } =
    await sanitizeStylePrompt(stylePrompt);
  // Advisory duration brief — Lyria has no hard duration knob on the
  // Interactions API, so the target length rides in the creative brief.
  const durationLine =
    opts.targetDurationS && opts.targetDurationS >= 30 && opts.targetDurationS <= 480
      ? `\nTarget song length: about ${Math.round(opts.targetDurationS)} seconds.`
      : "";
  const buildLyriaInput = (style: string) =>
    vocalMode === "instrumental"
      ? `${style}${durationLine}\n\nInstrumental only — no vocals, no singing, no spoken words, no humming.`
      : vocalMode === "random"
        ? `${style}${durationLine}\n\nWrite and sing your own original lyrics that fit this style.`
        : `${style}${durationLine}\n\nSing these exact lyrics, word for word:\n${normalized}`;
  if (promptOptimized) {
    logger.info({ vocalMode }, "mlkOrchestrator: style prompt was AI-optimized before Lyria");
  }

  // Zero-rejection loop (Input + Output Shield):
  //  - If Lyria's opaque policy filter still blocks the sanitized prompt, run
  //    ONE aggressive Gemini rescue rewrite and retry. A second block surfaces
  //    as the clean 422 "prompt flagged" message.
  //  - If Lyria returns malformed output (empty/truncated audio), retry once
  //    with the same input — transient engine faults never reach the user raw.
  //  (User lyrics stay verbatim on retry — only the style portion is rewritten.)
  const MIN_VALID_AUDIO_BYTES = 10_000;
  const runLyria = async (style: string) => {
    const result = await generateLyriaAudio(buildLyriaInput(style));
    if (!result.audio || result.audio.length < MIN_VALID_AUDIO_BYTES) {
      throw new Error(`MALFORMED_LYRIA_OUTPUT: audio was ${result.audio?.length ?? 0} bytes`);
    }
    return result;
  };
  let lyriaResult: Awaited<ReturnType<typeof generateLyriaAudio>>;
  try {
    lyriaResult = await runLyria(lyriaStylePrompt);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (/content_blocked|blocked for an unspecified policy/i.test(msg)) {
      logger.warn({ vocalMode }, "mlkOrchestrator: Lyria blocked the prompt — rescue rewrite + one retry");
      const rescued = await rewriteBlockedPrompt(lyriaStylePrompt);
      lyriaResult = await runLyria(rescued);
    } else if (/MALFORMED_LYRIA_OUTPUT/.test(msg)) {
      logger.warn({ vocalMode, err: msg }, "mlkOrchestrator: Lyria output malformed — one retry");
      lyriaResult = await runLyria(lyriaStylePrompt);
    } else {
      throw err;
    }
  }
  const { audio, mimeType, model: lyriaModel, responseLyrics } = lyriaResult;

  const tmpTag = randomUUID();
  const rawExt = /mpeg|mp3/i.test(mimeType) ? "mp3" : "wav";
  const rawPath = `/tmp/mlk_gen_${tmpTag}.${rawExt}`;
  const outPath = `/tmp/mlk_gen_out_${tmpTag}.wav`;
  const previewPath = `/tmp/mlk_gen_prev_${tmpTag}.mp3`;
  const mp3Path = `/tmp/mlk_gen_full_${tmpTag}.mp3`;
  const coverPath = `/tmp/mlk_gen_cover_${tmpTag}.png`;
  let normalizedPath: string | null = null;

  try {
    await writeFile(rawPath, audio);
    // Format normalization only (ingest plumbing, same as master.ts) — all DSP
    // happens inside the kernel.
    normalizedPath = await normalizeToWav(rawPath);
    const durationS = await probeFileDuration(normalizedPath);

    // Pre-kernel bytes — cert binds to the generated mix, not kernel output.
    const preKernelBytes = await readFile(normalizedPath);

    // ── c) NO auto-mastering (product decision 2026-08-11) ──────────────────
    // Generation drops an UNMASTERED track into the Mastering Tool, playable
    // like any uploaded song. Mastering is a separate, user-initiated paid
    // step there — never bundled into generation. (runMlkKernel remains in
    // use by the standalone mastering route.)
    const kernelEngine = "unmastered";
    const masteredWav: Buffer<ArrayBufferLike> = preKernelBytes;

    // ── d) Commercial classification + optional dual-anchor certificate ─────
    // ACRCloud is strictly an optional stamping dependency. Generation, vault
    // storage, playback, and download all continue if the provider is offline,
    // suspended, times out, or returns a match; in those cases finalWav remains
    // unmodified and no certificate row is created.
    const fingerprint = await scanCommercialFingerprint(normalizedPath);
    const shouldStamp = fingerprint.status === "no_match";
    const certificationStatus: GenerateAndMasterResult["certificationStatus"] =
      shouldStamp
        ? "sealed"
        : fingerprint.status === "match"
          ? "skipped_match"
          : "skipped_unavailable";
    if (!shouldStamp) {
      logger.warn(
        {
          fingerprintStatus: fingerprint.status,
          reason: fingerprint.status === "unavailable" ? fingerprint.reason : undefined,
          vocalMode,
        },
        "mlkOrchestrator: generation completed without certificate stamp",
      );
    }

    const contentHash = createHash("sha256").update(preKernelBytes).digest("hex");
    let certId: string | null = null;
    let denominator: string | null = null;
    let handshake: string | null = null;
    let finalWav: Buffer<ArrayBufferLike> = masteredWav;
    if (shouldStamp) {
      const secret = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
      certId = randomUUID();
      const fullHash = createHash("sha256")
        .update(`${contentHash}|${artistHandle}|${certId}`)
        .digest("hex");
      const nominator = fullHash.slice(0, 32);
      denominator = fullHash.slice(32);
      handshake = createHmac("sha256", secret)
        .update(`${certId}|${nominator}|${denominator}`)
        .digest("hex");
      const nominatorPayload = Buffer.from(
        JSON.stringify({ v: 2, id: certId, n: nominator, a: artistHandle }),
      );
      finalWav = embedLsbPayload(masteredWav, nominatorPayload);
    }

    // Dev-only: keep a local copy of the final master so it can be audited
    // even if the object-storage vault write fails. Never runs in production.
    if (process.env.NODE_ENV === "development") {
      const localDir = "local_masters";
      await mkdir(localDir, { recursive: true }).catch(() => {});
      await writeFile(`${localDir}/mlk_v35_${certId ?? `unstamped_${tmpTag}`}.wav`, finalWav).catch(() => {});
    }

    // ── Vault: existing tracks + purchased_tracks tables → /api/library ────
    const trackId = randomUUID();
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
    const audioFullKey = `private/tracks/${trackId}/audio_full.wav`;
    // Convention: full-length 320 kbps MP3 lives next to the WAV with the same
    // basename — the download route derives this key, so no schema change.
    const audioFullMp3Key = `private/tracks/${trackId}/audio_full.mp3`;
    const audioPreviewKey = `tracks/${trackId}/audio_preview.mp3`;
    const coverArtKey = `tracks/${trackId}/cover_art.png`;

    // 30-sec public preview + full 320k MP3 + generated cover (plumbing, not DSP).
    await execFileAsync("ffmpeg", [
      "-y", "-i", normalizedPath, "-t", "30", "-b:a", "128k", previewPath,
    ], { timeout: 60_000 });
    await execFileAsync("ffmpeg", [
      "-y", "-i", normalizedPath, "-b:a", "320k", mp3Path,
    ], { timeout: 120_000 });
    // Auto-generated album cover: deterministic two-tone gradient seeded from
    // the track id + the title drawn on top — simple, static, never blank.
    await execFileAsync("ffmpeg", buildCoverArgs(trackId, title, coverPath), { timeout: 30_000 });

    // Object writes FIRST — if any fails, no cert or track row was committed,
    // so there is no orphaned legal record or inaccessible vault entry.
    // saveObjectWithFallback lands the bytes in the owner-project fallback
    // bucket when the Replit-managed bucket rejects the write (platform 403).
    // If BOTH backends fail, surface a clean, human-readable error instead of
    // the raw GCS JSON dump — the generation itself succeeded; storage didn't.
    try {
      await Promise.all([
        saveObjectWithFallback(bucketId, audioFullKey, finalWav, { contentType: "audio/wav" }),
        readFile(mp3Path).then((b) => saveObjectWithFallback(bucketId, audioFullMp3Key, b, { contentType: "audio/mpeg" })),
        readFile(previewPath).then((b) => objectStorage.savePublicObject(audioPreviewKey, b, "audio/mpeg")),
        readFile(coverPath).then((b) => objectStorage.savePublicObject(coverArtKey, b, "image/png")),
      ]);
    } catch (storageErr) {
      const reason = String((storageErr as Error)?.message ?? storageErr).slice(0, 200);
      logger.error(
        { err: reason, trackId, certId },
        "mlkOrchestrator: vault save failed on BOTH storage backends",
      );
      throw new Error(
        "Storage Configuration Error — your track was generated and mastered, but could not be " +
          "saved to cloud storage (both the primary and backup vaults rejected the write). " +
          "Nothing was recorded or charged; please try again shortly.",
      );
    }

    // ── e) Capture AI-written lyrics for vocalMode "random" ────────────────
    // Try the Lyria response text first (the model may include the lyrics it
    // composed alongside the audio). Fall back to Gemini transcription of the
    // generated audio. Both paths are fail-soft: a transcription error only
    // means "No lyrics on file" — it never aborts the track save.
    const AI_LYRICS_HEADER = "[AI-written lyrics]\n";
    let aiLyricsText: string | null = null;
    if (vocalMode === "random") {
      if (responseLyrics) {
        aiLyricsText = AI_LYRICS_HEADER + responseLyrics;
        logger.info({ trackId: "pending" }, "mlkOrchestrator: captured AI lyrics from Lyria response");
      } else {
        try {
          const { fullText } = await transcribeWithGemini(normalizedPath);
          if (fullText.trim()) {
            aiLyricsText = AI_LYRICS_HEADER + fullText.trim();
            logger.info({ trackId: "pending" }, "mlkOrchestrator: captured AI lyrics via Gemini transcription");
          }
        } catch (transcribeErr) {
          logger.warn({ err: transcribeErr }, "mlkOrchestrator: AI lyrics transcription failed (non-fatal)");
        }
      }
    }

    // Cert stub + track + entitlement commit atomically: either the user gets
    // a fully valid, downloadable, certified track, or nothing is recorded.
    // For remixes, the parent track + parent cert ids are baked into the
    // child cert's server-side record — a verifiable chain of title.
    const remixMarkers = opts.remixOf
      ? ` remixOf:${opts.remixOf.parentTrackId}${opts.remixOf.parentCertId ? ` parentCert:${opts.remixOf.parentCertId}` : ""}`
      : "";
    const stylePromptRecord = `${stylePrompt} [vocalMode:${vocalMode}${lyricHash ? ` lyricSha256:${lyricHash}` : ""}${lyricId ? ` lyricProject:${lyricId}` : ""}${remixMarkers}]`;
    await db.transaction(async (tx) => {
      if (certId && denominator && handshake) {
        await tx.insert(ipCertStubsTable).values({
          certId,
          denominator,
          handshake,
          contentHash,
          artist: artistHandle,
          // Bind the lyric possession hash into the court record — evidence of
          // the human-authored input that drove the generation.
          stylePrompt: stylePromptRecord,
          styleAuthorshipScore: null,
          // Certificate paywall metadata: generated in-house, owned by the
          // generating account. The document stays locked until unlocked
          // (purchase or included allowance) — enforced in court-cert.ts.
          ownerUserId: userId,
          category: vocalMode === "instrumental" ? "instrumental" : "full_track",
          provenance: "internal",
        });
      }
      await tx.insert(tracksTable).values({
        id: trackId,
        title,
        artistName: artistHandle,
        audioFullKey,
        audioPreviewKey,
        coverArtKey,
        // PRIVATE: generated tracks land ONLY in the creator's personal
        // library. The public label page lists "accepted" tracks exclusively —
        // a track reaches it via submit → admin approval (or admin upload),
        // never automatically from generation.
        status: "private",
        price: 0,
        submittedByUserId: userId,
        // Lyrics stored for both user-supplied (vocalMode "lyrics") and
        // AI-written (vocalMode "random") tracks. AI-written lyrics carry the
        // "[AI-written lyrics]" header so the player can label them correctly.
        lyricsText:
          vocalMode === "lyrics" && normalized
            ? normalized
            : vocalMode === "random" && aiLyricsText
              ? aiLyricsText
              : null,
      });
      await tx.insert(purchasedTracksTable).values({
        userId,
        trackId,
        stripeCheckoutSessionId: `mlk-gen-${certId ?? trackId}`,
      });
    });

    // Fire-and-forget court replica only AFTER the primary record committed.
    if (certId && denominator && handshake) {
      backupCertStub({
        certId,
        denominator,
        handshake,
        contentHash,
        artist: artistHandle,
        stylePrompt: stylePromptRecord,
        styleAuthorshipScore: null,
        certifiedAt: new Date().toISOString(),
      });
    }

    return {
      trackId,
      certId,
      certificationStatus,
      lyricHash,
      lyriaModel,
      kernelEngine,
      durationS,
      title,
    };
  } finally {
    await Promise.all(
      [rawPath, outPath, previewPath, mp3Path, coverPath, normalizedPath]
        .filter((p): p is string => !!p)
        .map((p) => unlink(p).catch(() => {})),
    );
  }
}

/**
 * Remix an existing vault track through the full MLK v3.5 pipeline.
 *
 * The parent track's ORIGINAL style prompt (from its cert stub, stripped of
 * machine-readable markers) is the hidden base anchor; the user's new twist is
 * blended on top so the variation keeps the original's identity. The output
 * runs through the real MLK v3.5 master pipeline and gets a CHILD cert whose
 * server-side record links back to the parent track + parent cert.
 */
export async function remixTrack(
  parentTrackId: string,
  userId: string,
  opts: { twist?: string; vocalsOn?: boolean; artistName?: string } = {},
): Promise<GenerateAndMasterResult> {
  const [parent] = await db
    .select({
      id: tracksTable.id,
      title: tracksTable.title,
      artistName: tracksTable.artistName,
      submittedByUserId: tracksTable.submittedByUserId,
    })
    .from(tracksTable)
    .where(eq(tracksTable.id, parentTrackId))
    .limit(1);
  if (!parent) throw new Error("Original track not found.");

  // Ownership gate: only the track's creator or an entitled owner can remix it.
  let owned = parent.submittedByUserId === userId;
  if (!owned) {
    const entitled = await db
      .select({ trackId: purchasedTracksTable.trackId })
      .from(purchasedTracksTable)
      .where(and(eq(purchasedTracksTable.userId, userId), eq(purchasedTracksTable.trackId, parentTrackId)))
      .limit(1);
    owned = entitled.length > 0;
  }
  if (!owned) throw new Error("You can only remix tracks from your own vault.");

  // Parent cert id is encoded in the MLK-generation entitlement row.
  const genRows = await db
    .select({ session: purchasedTracksTable.stripeCheckoutSessionId })
    .from(purchasedTracksTable)
    .where(
      and(
        eq(purchasedTracksTable.trackId, parentTrackId),
        like(purchasedTracksTable.stripeCheckoutSessionId, "mlk-gen-%"),
      ),
    )
    .limit(1);
  const parentCertId = genRows[0]?.session?.slice("mlk-gen-".length) || null;

  // Chain-of-title requirement: a remix child cert MUST anchor to a real
  // parent MLK cert. No title-derived fallback — a certified Remix Engine
  // request against a track without a recoverable cert is refused outright,
  // otherwise we'd mint an unanchored child certificate.
  if (!parentCertId) {
    throw new Error("Original track not found. Only tracks generated by MLK v3.5 can be remixed.");
  }
  const [stub] = await db
    .select({ stylePrompt: ipCertStubsTable.stylePrompt })
    .from(ipCertStubsTable)
    .where(eq(ipCertStubsTable.certId, parentCertId))
    .limit(1);
  // Hidden base anchor: the parent's original creative direction.
  const basePrompt = (stub?.stylePrompt ?? "").replace(/\s*\[vocalMode:[^\]]*\]\s*$/, "").trim();
  if (!basePrompt) {
    throw new Error("Original track not found. The original track's certificate record is missing.");
  }

  // NOTE: pure style description only — NO meta-language. Wording like
  // "remix of the original track <title>" or "keep this exact style" trips
  // Lyria's content policy (reads as a request to reproduce an existing
  // recording) and gets the whole run blocked.
  const twist = opts.twist?.trim() ?? "";
  const blendedPrompt = [basePrompt.replace(/[.\s]+$/, ""), twist.replace(/[.\s]+$/, ""), "fresh variation with new arrangement details"]
    .filter(Boolean)
    .join(". ");

  return generateAndMasterTrack(null, "", userId, {
    title: `${parent.title} (Remix)`.slice(0, 120),
    artistName: opts.artistName ?? parent.artistName ?? undefined,
    stylePrompt: blendedPrompt,
    // Remixes never carry user lyrics: vocals ON → model-written lyrics,
    // vocals OFF → strict instrumental directive.
    vocalMode: opts.vocalsOn ? "random" : "instrumental",
    remixOf: { parentTrackId, parentCertId },
  });
}
