/**
 * Webhook-chained generation state machine.
 *
 * The client-facing route only validates, persists a durable job row, and
 * returns 202. Every long-running inference boundary is crossed via Replicate
 * webhooks — no HTTP request ever waits on a prediction:
 *
 *   dispatchGeneration   Lyria (Vertex) → upload → Demucs prediction (webhook)
 *   handleDemucsWebhook  store stem URLs → RVC prediction (webhook)
 *   handleRvcWebhook     mix + Python MLK V3.5 master → vault save → completed
 *
 * Stage state lives in masterJobsTable (jobs) so a poll of
 * GET /api/jobs/:id always reflects the true pipeline position.
 */
import { execFile } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { db, tracksTable, purchasedTracksTable } from "@workspace/db";
import { masterJobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

import {
  convertToGravelKingVoice,
  createPrediction,
  predictionOutputUrl,
  uploadFile,
} from "../replicateClient";
import {
  buildCoverArtBuffer,
  buildGeneratedAudioKeys,
  buildGeneratedPreviewBuffer,
  downloadVoiceSwapOutput,
  mixVoiceSwapAudioInMemory,
  saveGeneratedAudioArtifacts,
} from "./mlkOrchestrator";
import { buildSignedRvcModelStreamUrl, resolveRvcModelOrigin } from "./rvcModelAccess";
import { saveObjectWithFallback, ObjectStorageService } from "../lib/objectStorage";
import { CREDIT_COSTS, grantCredits } from "../lib/credits";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);
const pipelineStorage = new ObjectStorageService();

export type PipelineStage = "demucs" | "rvc";

interface PipelineRequestConfig {
  title?: string | null;
  artistName?: string | null;
  stylePrompt?: string | null;
  vocalMode?: string | null;
  lyricId?: string | null;
  lyrics?: string | null;
  durationS?: number | null;
  creditReference?: string;
  creditsSpent?: boolean;
  origin?: string;
  demucsVocalUrl?: string;
  demucsInstrumentalUrl?: string;
  [key: string]: unknown;
}

/** HMAC token so Replicate webhooks can't be forged to advance random jobs. */
export function pipelineWebhookToken(jobId: string, stage: PipelineStage): string {
  const secret = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
  return createHmac("sha256", secret).update(`pipeline:${jobId}:${stage}`).digest("hex").slice(0, 32);
}

function webhookUrl(origin: string, jobId: string, stage: PipelineStage): string {
  const base = resolveRvcModelOrigin(origin);
  return `${base}/api/webhooks/replicate?job=${encodeURIComponent(jobId)}&stage=${stage}&token=${pipelineWebhookToken(jobId, stage)}`;
}

async function updateJob(
  jobId: string,
  values: Partial<typeof masterJobsTable.$inferInsert>,
): Promise<void> {
  await db.update(masterJobsTable).set(values).where(eq(masterJobsTable.id, jobId));
}

async function failJob(jobId: string, message: string): Promise<void> {
  const [job] = await db.select().from(masterJobsTable).where(eq(masterJobsTable.id, jobId)).limit(1);
  const cfg = (job?.requestConfig ?? {}) as PipelineRequestConfig;
  if (job?.userId && cfg.creditsSpent && cfg.creditReference) {
    await grantCredits(
      job.userId,
      CREDIT_COSTS.song,
      "failed_song_refund",
      `refund:${cfg.creditReference}`,
    ).catch((err) => logger.error({ err, jobId }, "pipeline refund failed"));
  }
  await updateJob(jobId, {
    status: "failed",
    stage: "failed",
    error: message.slice(0, 500),
    completedAt: new Date(),
  });
}

/**
 * Stage 1 entry — called from the background of the 202 route. Runs Lyria
 * (Vertex, not Replicate), uploads the take, and dispatches Demucs with a
 * webhook. Returns as soon as the prediction is created; the request is long
 * gone by then either way.
 */
export async function dispatchGeneration(input: {
  jobId: string;
  audio: Buffer;
  config: PipelineRequestConfig;
}): Promise<void> {
  const { jobId, config } = input;
  const origin = config.origin ?? "";
  await updateJob(jobId, { status: "processing", stage: "processing_demucs", progress: 25 });
  const audioUrl = await uploadFile(input.audio, "gk_pipeline_input", "audio/mpeg");
  const predictionId = await createPrediction(
    "ryan5453",
    "demucs",
    { audio: audioUrl, model: "htdemucs", stem: "vocals", output_format: "wav" },
    webhookUrl(origin, jobId, "demucs"),
  );
  logger.info({ jobId, predictionId }, "[pipeline] Demucs dispatched — awaiting webhook");
}

/** Stage 2 — Demucs webhook: persist stem URLs, dispatch RVC with webhook. */
export async function handleDemucsWebhook(jobId: string, output: unknown): Promise<void> {
  const [job] = await db.select().from(masterJobsTable).where(eq(masterJobsTable.id, jobId)).limit(1);
  if (!job) throw new Error(`pipeline job ${jobId} not found`);
  const config = (job.requestConfig ?? {}) as PipelineRequestConfig;

  const stems = Object.fromEntries(
    Object.entries((output ?? {}) as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" && (v as string).startsWith("http")),
  ) as Record<string, string>;
  const vocalUrl = stems["vocals"];
  const instrumentalUrl =
    stems["no_vocals"] ?? stems["accompaniment"] ?? stems["no_vocal"] ?? stems["instrumental"];
  if (!vocalUrl || !instrumentalUrl) {
    throw new Error(`Demucs output missing stems. Keys: ${Object.keys(stems).join(", ")}`);
  }

  await updateJob(jobId, {
    stage: "processing_rvc",
    progress: 60,
    requestConfig: { ...config, demucsVocalUrl: vocalUrl, demucsInstrumentalUrl: instrumentalUrl },
  });

  const origin = config.origin ?? "";
  const conversion = await convertToGravelKingVoice({
    audioUrl: vocalUrl,
    modelWeightsUrl: buildSignedRvcModelStreamUrl(resolveRvcModelOrigin(origin), 3600),
    pitchShift: 0,
    indexRate: 0.78,
    protect: 0.02,
    filterRadius: 3,
    webhook: webhookUrl(origin, jobId, "rvc"),
  });
  logger.info(
    { jobId, predictionId: conversion.predictionId },
    "[pipeline] RVC dispatched — awaiting webhook",
  );
}

/**
 * Stage 3 — RVC webhook: download converted vocal + stored instrumental, mix,
 * run the Python MLK V3.5 master chain, save to the vault, mark completed.
 * Runs fully in the webhook's background after an immediate 200.
 */
export async function handleRvcWebhook(jobId: string, output: unknown): Promise<void> {
  const [job] = await db.select().from(masterJobsTable).where(eq(masterJobsTable.id, jobId)).limit(1);
  if (!job) throw new Error(`pipeline job ${jobId} not found`);
  const config = (job.requestConfig ?? {}) as PipelineRequestConfig;
  if (!job.userId) throw new Error(`pipeline job ${jobId} has no owner`);
  if (!config.demucsInstrumentalUrl) throw new Error("pipeline job missing Demucs instrumental URL");

  await updateJob(jobId, { stage: "processing_mlk_master", progress: 85 });

  const convertedUrl = predictionOutputUrl(output);
  const [converted, instrumental] = await Promise.all([
    downloadVoiceSwapOutput(convertedUrl),
    downloadVoiceSwapOutput(config.demucsInstrumentalUrl),
  ]);
  if (converted.length < 1_000) throw new Error("RVC webhook delivered invalid audio");
  const mixed = await mixVoiceSwapAudioInMemory(instrumental, converted);

  // Python MLK V3.5 master — the only DSP path.
  const workId = randomUUID();
  const inPath = `/tmp/gk_pipe_${workId}.wav`;
  const wavPath = `/tmp/gk_pipe_${workId}_master.wav`;
  const mp3Path = `/tmp/gk_pipe_${workId}_master.mp3`;
  try {
    await writeFile(inPath, mixed);
    const pyWorker = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
    await execFileAsync("python3", [
      pyWorker,
      "--input", inPath,
      "--output", wavPath,
      "--mp3-output", mp3Path,
      "--preset", "natural_body",
      "--intensity", "0.75",
      "--sidechain-filter", "highpass",
      "--sidechain-freq", "80",
      "--stereo-link", "true",
      "--adaptive-mode", "bass_aware",
      "--auto-threshold", "false",
      "--target-lufs", "-14",
      "--ceiling-db", "-0.5",
    ], { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 });
    const [masteredWav, masteredMp3] = await Promise.all([readFile(wavPath), readFile(mp3Path)]);

    // Vault save + track rows.
    const trackId = randomUUID();
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
    const keys = buildGeneratedAudioKeys(trackId);
    const coverArtKey = `tracks/${trackId}/cover_art.png`;
    await saveGeneratedAudioArtifacts(
      {
        bucketId,
        keys,
        fullWav: masteredWav,
        fullMp3: masteredMp3,
        previewMp3: buildGeneratedPreviewBuffer(masteredMp3, "audio/mpeg"),
        coverArt: buildCoverArtBuffer(trackId),
      },
      {
        savePrivate: (id, key, body, contentType) =>
          saveObjectWithFallback(id, key, body, { contentType }),
        savePublic: (key, body, contentType) =>
          pipelineStorage.savePublicObject(key, body, contentType),
      },
    );

    const title = (config.title ?? "").toString().trim() || "MLK v3.5 Track";
    const artistName = (config.artistName ?? "").toString().trim() || "GravelKing Artist";
    const lyrics = config.lyrics ? String(config.lyrics) : null;
    await db.transaction(async (tx) => {
      await tx.insert(tracksTable).values({
        id: trackId,
        title,
        artistName,
        audioFullKey: keys.audioFullKey,
        audioPreviewKey: keys.audioPreviewKey,
        coverArtKey,
        status: "private",
        price: 0,
        submittedByUserId: job.userId,
        lyricsText: lyrics,
      });
      await tx.insert(purchasedTracksTable).values({
        userId: job.userId!,
        trackId,
        stripeCheckoutSessionId: `mlk-gen-${trackId}`,
      });
    });

    await updateJob(jobId, {
      status: "completed",
      stage: "done",
      progress: 100,
      outputObjectKey: trackId,
      outputUrl: `/api/tracks/${trackId}/stream`,
      completedAt: new Date(),
    });
    logger.info({ jobId, trackId }, "[pipeline] completed — MLK V3.5 master saved to vault");
  } finally {
    await Promise.all([
      unlink(inPath).catch(() => {}),
      unlink(wavPath).catch(() => {}),
      unlink(mp3Path).catch(() => {}),
    ]);
  }
}

/** Shared failure entry used by the webhook route. */
export async function failPipelineJob(jobId: string, message: string): Promise<void> {
  await failJob(jobId, message);
}
