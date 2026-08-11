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
import { embedLsbPayload } from "../kernel-v3";
import { normalizeToWav, probeFileDuration } from "../lib/audioGuards";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { backupCertStub } from "../lib/firestore";
import { getGcpCredentials, getVertexAccessToken, VERTEX_LOCATION } from "../geminiVertex";
import { logger } from "../lib/logger";

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

export interface GenerateAndMasterResult {
  trackId: string;
  certId: string;
  lyricHash: string;
  lyriaModel: string;
  kernelEngine: "cloud-run" | "local";
  durationS: number;
  title: string;
}

/** Same normalization + SHA-256 as the existing lyric possession stamp. */
export function hashLyrics(text: string): { normalized: string; hash: string } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  return {
    normalized,
    hash: createHash("sha256").update(normalized, "utf8").digest("hex"),
  };
}

interface InteractionContentBlock {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  text?: string;
}
interface InteractionStep {
  type?: string;
  content?: InteractionContentBlock[];
}
interface InteractionResponse {
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
 * Call Vertex AI Lyria 3 Pro via the Interactions API (the ONLY surface that
 * serves Lyria 3 on Vertex — :predict/:generateContent are not supported).
 * Lyria 3 requires location "global". Returns raw audio bytes (MP3).
 */
async function generateLyriaAudio(
  prompt: string,
  lyrics: string,
): Promise<{ audio: Buffer; mimeType: string; model: string }> {
  const creds = getGcpCredentials();
  const token = await getVertexAccessToken();
  const base = `https://aiplatform.googleapis.com/v1beta1/projects/${creds.project_id}/locations/global`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const res = await fetch(`${base}/interactions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: LYRIA_MODEL,
      input: `${prompt}\n\nSing these exact lyrics, word for word:\n${lyrics}`,
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
  return { audio: Buffer.from(audio.data, "base64"), mimeType: audio.mime, model: LYRIA_MODEL };
}

/**
 * Run the REAL Morris Law Kernel v3.5 on a normalized WAV file.
 * Identical invocation to routes/master.ts: Cloud Run primary, local Python
 * worker fallback (same kernel code). Throws if neither can run.
 */
async function runMlkKernel(
  kernelInputPath: string,
  outPath: string,
): Promise<"cloud-run" | "local"> {
  const remoteBase = process.env.MLK_KERNEL_URL?.replace(/\/$/, "");
  const d = KERNEL_DEFAULTS;

  if (remoteBase) {
    try {
      const audioBytes = await readFile(kernelInputPath);
      const form = new FormData();
      form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "input.wav");
      form.append("preset", KERNEL_PRESET.kernel);
      form.append("intensity", String(d.intensity));
      form.append("sidechain_filter", d.sidechainFilter);
      form.append("sidechain_freq", String(d.sidechainFreq));
      form.append("stereo_link", d.stereoLink ? "true" : "false");
      form.append("adaptive_mode", d.adaptiveMode);
      form.append("auto_threshold", d.autoThreshold ? "true" : "false");
      form.append("auto_offset", String(d.autoOffset));
      form.append("target_lufs", String(KERNEL_PRESET.lufs));
      form.append("ceiling_db", String(KERNEL_PRESET.ceiling));
      const headers: Record<string, string> = {};
      const apiKey = process.env.REMOTE_KERNEL_API_KEY;
      if (apiKey) headers["x-api-key"] = apiKey;
      const resp = await fetch(`${remoteBase}/master`, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(280_000),
      });
      if (!resp.ok) {
        throw new Error(`remote kernel HTTP ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
      }
      await writeFile(outPath, Buffer.from(await resp.arrayBuffer()));
      return "cloud-run";
    } catch (remoteErr) {
      logger.warn(
        { err: String((remoteErr as Error)?.message ?? remoteErr).slice(0, 200) },
        "mlkOrchestrator: remote kernel unavailable — falling back to local worker (same kernel code)",
      );
    }
  }

  // Local worker — the SAME Python MLK v3.5 kernel, resolved relative to the
  // bundle exactly like routes/master.ts does.
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
  opts: { title?: string; artistName?: string; stylePrompt?: string } = {},
): Promise<GenerateAndMasterResult> {
  // ── a) Lyric certification hash ─────────────────────────────────────────
  const { normalized, hash: lyricHash } = hashLyrics(text);
  if (normalized.length < 5) throw new Error("Lyrics text is required (min 5 characters).");

  const title = opts.title?.trim() || normalized.split("\n")[0]!.slice(0, 80) || "MLK v3.5 Track";
  const artistHandle = opts.artistName?.trim() || "GravelKing Artist";
  const stylePrompt =
    opts.stylePrompt?.trim() ||
    "Full song with vocals, modern production, clean mix, structured verses and chorus.";

  // ── b) Vertex AI Lyria generation ───────────────────────────────────────
  const { audio, mimeType, model: lyriaModel } = await generateLyriaAudio(stylePrompt, normalized);

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

    // ── c) REAL Morris Law Kernel v3.5 ──────────────────────────────────────
    const kernelEngine = await runMlkKernel(normalizedPath, outPath);
    const masteredWav = Buffer.from(await readFile(outPath));

    // ── d) Dual-Anchor HMAC certificate (identical scheme to master.ts) ─────
    const secret = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
    const certId = randomUUID();
    const contentHash = createHash("sha256").update(preKernelBytes).digest("hex");
    const fullHash = createHash("sha256")
      .update(`${contentHash}|${artistHandle}|${certId}`)
      .digest("hex");
    const nominator = fullHash.slice(0, 32);
    const denominator = fullHash.slice(32);
    const handshake = createHmac("sha256", secret)
      .update(`${certId}|${nominator}|${denominator}`)
      .digest("hex");

    const nominatorPayload = Buffer.from(
      JSON.stringify({ v: 2, id: certId, n: nominator, a: artistHandle }),
    );
    const finalWav = embedLsbPayload(masteredWav, nominatorPayload);

    // Dev-only: keep a local copy of the final master so it can be audited
    // even if the object-storage vault write fails. Never runs in production.
    if (process.env.NODE_ENV === "development") {
      const localDir = "local_masters";
      await mkdir(localDir, { recursive: true }).catch(() => {});
      await writeFile(`${localDir}/mlk_v35_${certId}.wav`, finalWav).catch(() => {});
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
      "-y", "-i", outPath, "-t", "30", "-b:a", "128k", previewPath,
    ], { timeout: 60_000 });
    await execFileAsync("ffmpeg", [
      "-y", "-i", outPath, "-b:a", "320k", mp3Path,
    ], { timeout: 120_000 });
    await execFileAsync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "color=c=0x18181b:s=600x600", "-frames:v", "1", coverPath,
    ], { timeout: 30_000 });

    // Object writes FIRST — if any fails, no cert or track row was committed,
    // so there is no orphaned legal record or inaccessible vault entry.
    await Promise.all([
      objectStorageClient.bucket(bucketId).file(audioFullKey).save(finalWav, { contentType: "audio/wav" }),
      readFile(mp3Path).then((b) => objectStorageClient.bucket(bucketId).file(audioFullMp3Key).save(b, { contentType: "audio/mpeg" })),
      readFile(previewPath).then((b) => objectStorage.savePublicObject(audioPreviewKey, b, "audio/mpeg")),
      readFile(coverPath).then((b) => objectStorage.savePublicObject(coverArtKey, b, "image/png")),
    ]);

    // Cert stub + track + entitlement commit atomically: either the user gets
    // a fully valid, downloadable, certified track, or nothing is recorded.
    const stylePromptRecord = `${stylePrompt} [lyricSha256:${lyricHash}${lyricId ? ` lyricProject:${lyricId}` : ""}]`;
    await db.transaction(async (tx) => {
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
      });
      await tx.insert(tracksTable).values({
        id: trackId,
        title,
        artistName: artistHandle,
        audioFullKey,
        audioPreviewKey,
        coverArtKey,
        status: "accepted",
        price: 0,
        submittedByUserId: userId,
      });
      await tx.insert(purchasedTracksTable).values({
        userId,
        trackId,
        stripeCheckoutSessionId: `mlk-gen-${certId}`,
      });
    });

    // Fire-and-forget court replica only AFTER the primary record committed.
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

    return { trackId, certId, lyricHash, lyriaModel, kernelEngine, durationS, title };
  } finally {
    await Promise.all(
      [rawPath, outPath, previewPath, mp3Path, coverPath, normalizedPath]
        .filter((p): p is string => !!p)
        .map((p) => unlink(p).catch(() => {})),
    );
  }
}
