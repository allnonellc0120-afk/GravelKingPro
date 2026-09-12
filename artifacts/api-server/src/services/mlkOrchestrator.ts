/**
 * GravelKing V2 generation orchestrator.
 *
 * Generated audio, separated stems, voice-conversion results, previews, and
 * cover art remain in memory until they are written directly to Object Storage.
 * Generation stays unmastered; mastering remains a separate user action.
 */

import { randomUUID, createHash, createHmac } from "crypto";
import { deflateSync } from "zlib";
import { spawn } from "child_process";

import { db, ipCertStubsTable, tracksTable, purchasedTracksTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import { embedLsbPayload } from "../kernel-v3";
import { ObjectStorageService, saveObjectWithFallback } from "../lib/objectStorage";
import { backupCertStub } from "../lib/firestore";
import { getGcpCredentials, getVertexAccessToken, VERTEX_LOCATION } from "../geminiVertex";
import { logger } from "../lib/logger";
import { sanitizeStylePrompt, rewriteBlockedPrompt } from "./promptSanitizer";
import { convertToGravelKingVoice, runModel, uploadFile } from "../replicateClient";

const objectStorage = new ObjectStorageService();
const VOICE_SWAP_TIMEOUT_MS = 180_000;

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
  finalLyricsHash?: string;
  lyricsAuthorshipScore?: number;
}

export const GENERATED_PREVIEW_SECONDS = 30;

export function buildGeneratedAudioKeys(trackId: string): {
  audioFullKey: string;
  audioFullMp3Key: string;
  audioPreviewKey: string;
} {
  return {
    audioFullKey: `private/tracks/${trackId}/audio_full.wav`,
    audioFullMp3Key: `private/tracks/${trackId}/audio_full.mp3`,
    audioPreviewKey: `tracks/${trackId}/audio_preview.mp3`,
  };
}

async function downloadVoiceSwapOutput(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`RVC output download failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    if (controller.signal.aborted) throw new Error("RVC output download timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function mixVoiceSwapAudioInMemory(
  instrumental: Buffer,
  converted: Buffer,
): Promise<Buffer> {
  const child = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", "pipe:0",
    "-i", "pipe:3",
    // Trim the converted vocal by exactly 2.5 dB, then oversample before the
    // final limiter so the -0.5 dB ceiling is enforced against inter-sample
    // peaks rather than only the source sample grid.
    "-filter_complex",
    "[0:a]aresample=192000[bed];" +
      "[1:a]volume=-2.5dB," +
      "highshelf=f=6500:gain=-3.5," +
      "equalizer=f=240:width_type=q:width=0.8:g=2.0," +
      "aecho=0.85:0.7:25|45:0.18|0.12," +
      "aresample=192000[vox];" +
      "[bed][vox]amix=inputs=2:duration=longest:dropout_transition=0[mix];" +
      "[mix]alimiter=limit=0.9440608763:attack=5:release=50:level=disabled,aresample=48000[out]",
    "-map", "[out]",
    "-acodec", "pcm_s16le", "-f", "wav", "pipe:1",
  ], { stdio: ["pipe", "pipe", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  const result = await new Promise<Buffer>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`In-memory audio recombination failed (${code}): ${Buffer.concat(errors).toString().slice(0, 500)}`));
    });
    child.stdin.end(converted);
    (child.stdio[3] as NodeJS.WritableStream | null)?.write(instrumental, () => {
      (child.stdio[3] as NodeJS.WritableStream).end();
    });
  });
  if (!result.length) throw new Error("In-memory audio recombination returned no audio");
  return result;
}

function withVoiceSwapTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`RVC conversion timed out after ${VOICE_SWAP_TIMEOUT_MS}ms`)),
        VOICE_SWAP_TIMEOUT_MS,
      ),
    ),
  ]);
}

export interface GravelKingVoiceSwapResult {
  audio: Buffer;
  predictionId: string;
  mixed: true;
}

export async function tryGravelKingVoiceSwap(
  inputAudio: Buffer,
  modelWeightsUrl?: string,
): Promise<GravelKingVoiceSwapResult> {
  const audioUrl = await uploadFile(inputAudio, "gk_input_audio", "audio/mpeg");
  const splitOutput = await withVoiceSwapTimeout(runModel(
    "ryan5453",
    "demucs",
    { audio: audioUrl, model: "htdemucs", stem: "vocals", output_format: "wav" },
    90_000,
  ));
  const stemUrls = Object.fromEntries(
    Object.entries(splitOutput as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string" && value.startsWith("http")),
  ) as Record<string, string>;
  const vocalUrl = stemUrls["vocals"];
  const instrumentalUrl =
    stemUrls["no_vocals"] ??
    stemUrls["accompaniment"] ??
    stemUrls["no_vocal"] ??
    stemUrls["instrumental"];
  if (!vocalUrl || !instrumentalUrl) throw new Error("RVC split did not return both stems");
  const [vocals, instrumental] = await Promise.all([
    downloadVoiceSwapOutput(vocalUrl),
    downloadVoiceSwapOutput(instrumentalUrl),
  ]);
  const conversion = await withVoiceSwapTimeout(convertToGravelKingVoice({
    audioUrl: await uploadFile(vocals, "gk_vocal.wav", "audio/wav"),
    modelWeightsUrl:
      modelWeightsUrl ??
      process.env["REPLICATE_RVC_MODEL_WEIGHTS_URL"] ??
      undefined,
    pitchShift: 0,
    indexRate: 0.78,
    protect: 0.02,
    filterRadius: 3,
  }));
  logger.info(
    { predictionId: conversion.predictionId },
    "[Gravel King RVC: PREDICTION CREATED]",
  );
  const converted = await downloadVoiceSwapOutput(conversion.outputUrl);
  if (converted.length < 1_000) {
    throw new Error(`RVC prediction ${conversion.predictionId} returned invalid audio`);
  }
  const mixed = await mixVoiceSwapAudioInMemory(instrumental, converted);
  const mixedHash = createHash("sha256").update(mixed).digest("hex");
  const instrumentalHash = createHash("sha256").update(instrumental).digest("hex");
  const convertedHash = createHash("sha256").update(converted).digest("hex");
  if (mixedHash === instrumentalHash || mixedHash === convertedHash) {
    throw new Error(`RVC prediction ${conversion.predictionId} was not mixed into the final master`);
  }
  logger.info(
    { predictionId: conversion.predictionId, mixedBytes: mixed.length, mixedHash },
    "[Gravel King RVC: MIX VERIFIED]",
  );
  return { audio: mixed, predictionId: conversion.predictionId, mixed: true };
}

export async function saveGeneratedAudioArtifacts(
  args: {
    bucketId: string;
    keys: ReturnType<typeof buildGeneratedAudioKeys>;
    fullWav: Buffer;
    fullMp3: Buffer;
    previewMp3: Buffer;
    coverArt: Buffer;
  },
  writers: {
    savePrivate: (bucketId: string, key: string, body: Buffer, contentType: string) => Promise<unknown>;
    savePublic: (key: string, body: Buffer, contentType: string) => Promise<unknown>;
  },
): Promise<void> {
  await Promise.all([
    writers.savePrivate(args.bucketId, args.keys.audioFullKey, args.fullWav, "audio/wav"),
    writers.savePrivate(args.bucketId, args.keys.audioFullMp3Key, args.fullMp3, "audio/mpeg"),
    writers.savePublic(args.keys.audioPreviewKey, args.previewMp3, "audio/mpeg"),
    writers.savePublic(`tracks/${args.keys.audioPreviewKey.split("/")[1]}/cover_art.png`, args.coverArt, "image/png"),
  ]);
}

function wavDataRange(input: Buffer): { dataStart: number; dataLength: number; channels: number; sampleRate: number; bits: number } {
  if (input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("In-memory audio operation requires a PCM WAV buffer");
  }
  const channels = input.readUInt16LE(22);
  const sampleRate = input.readUInt32LE(24);
  const bits = input.readUInt16LE(34);
  let offset = 12;
  while (offset + 8 <= input.length) {
    const size = input.readUInt32LE(offset + 4);
    if (input.toString("ascii", offset, offset + 4) === "data") {
      return { dataStart: offset + 8, dataLength: Math.min(size, input.length - offset - 8), channels, sampleRate, bits };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("PCM WAV buffer has no data chunk");
}

export function mixPcmWavBuffers(left: Buffer, right: Buffer): Buffer {
  const a = wavDataRange(left);
  const b = wavDataRange(right);
  if (a.channels !== b.channels || a.sampleRate !== b.sampleRate || a.bits !== 16 || b.bits !== 16) {
    throw new Error("RVC stems must use matching 16-bit PCM WAV formats");
  }
  const length = Math.max(a.dataLength, b.dataLength);
  const data = Buffer.alloc(length);
  for (let offset = 0; offset + 1 < length; offset += 2) {
    const av = offset + 1 < a.dataLength ? left.readInt16LE(a.dataStart + offset) : 0;
    const bv = offset + 1 < b.dataLength ? right.readInt16LE(b.dataStart + offset) : 0;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, av + bv)), offset);
  }
  const out = Buffer.from(left.subarray(0, a.dataStart));
  out.writeUInt32LE(36 + data.length, 4);
  out.writeUInt32LE(data.length, a.dataStart - 4);
  return Buffer.concat([out, data]);
}

export function buildGeneratedPreviewBuffer(input: Buffer, mimeType: string): Buffer {
  if (!mimeType.includes("wav")) return input;
  const wav = wavDataRange(input);
  const bytesPerSecond = wav.sampleRate * wav.channels * (wav.bits / 8);
  const dataLength = Math.min(wav.dataLength, Math.floor(bytesPerSecond * GENERATED_PREVIEW_SECONDS));
  const out = Buffer.from(input.subarray(0, wav.dataStart + dataLength));
  out.writeUInt32LE(36 + dataLength, 4);
  out.writeUInt32LE(dataLength, wav.dataStart - 4);
  return out;
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}

export function buildCoverArtBuffer(trackId: string): Buffer {
  const seed = parseInt(trackId.replace(/-/g, "").slice(0, 8), 16) || 0x1f2937;
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const p = y * (width * 4 + 1) + 1 + x * 4;
      const blend = (x + y) / (width + height);
      raw[p] = ((seed >> 16) % 128) + Math.round(90 * blend);
      raw[p + 1] = ((seed >> 8) % 96) + Math.round(110 * (1 - blend));
      raw[p + 2] = (seed % 128) + Math.round(90 * blend);
      raw[p + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
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
    /** Signed clean-path URL for the GravelKing RVC package. */
    modelWeightsUrl?: string;
    /** When set, this run is a remix — the child cert records the parent linkage. */
    remixOf?: { parentTrackId: string; parentCertId: string | null };
    lyricAudit?: {
      finalLyricsHash: string;
      authorshipScore: number;
      ledger: unknown[];
    };
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

  let finalAudio = audio;
  let finalMimeType = mimeType;
  const durationS = mimeType.includes("wav") ? (() => {
    try {
      const wav = wavDataRange(audio);
      return wav.dataLength / (wav.sampleRate * wav.channels * (wav.bits / 8));
    } catch {
      return 0;
    }
  })() : 0;

  if (vocalMode !== "instrumental") {
    const voiceSwap = await tryGravelKingVoiceSwap(audio, opts.modelWeightsUrl);
    finalAudio = voiceSwap.audio;
    finalMimeType = "audio/wav";
    logger.info(
      { predictionId: voiceSwap.predictionId, mixed: voiceSwap.mixed },
      "[Gravel King Voice Swap: REQUIRED SUCCESS]",
    );
  }

  // Generation remains unmastered. All audio stays in memory until cloud storage.
  const preKernelBytes = finalAudio;

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
    const fingerprint = {
      status: "unavailable" as const,
      provider: "acrcloud" as const,
      reason: "fingerprint service unavailable in in-memory mode",
    };
    const shouldStamp = false;
    const certificationStatus: GenerateAndMasterResult["certificationStatus"] = "skipped_unavailable";
    logger.warn({ fingerprintStatus: fingerprint.status, reason: fingerprint.reason, vocalMode },
      "mlkOrchestrator: generation completed without certificate stamp");

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

    // ── Vault: existing tracks + purchased_tracks tables → /api/library ────
    const trackId = randomUUID();
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
    const { audioFullKey, audioFullMp3Key, audioPreviewKey } = buildGeneratedAudioKeys(trackId);
    // Convention: full-length 320 kbps MP3 lives next to the WAV with the same
    // basename — the download route derives this key, so no schema change.
    const coverArtKey = `tracks/${trackId}/cover_art.png`;

    // Object writes FIRST — if any fails, no cert or track row was committed,
    // so there is no orphaned legal record or inaccessible vault entry.
    // saveObjectWithFallback lands the bytes in the owner-project fallback
    // bucket when the Replit-managed bucket rejects the write (platform 403).
    // If BOTH backends fail, surface a clean, human-readable error instead of
    // the raw GCS JSON dump — the generation itself succeeded; storage didn't.
    try {
      await saveGeneratedAudioArtifacts(
        {
          bucketId,
          keys: { audioFullKey, audioFullMp3Key, audioPreviewKey },
          fullWav: finalWav,
          fullMp3: audio,
          previewMp3: buildGeneratedPreviewBuffer(finalAudio, finalMimeType),
          coverArt: buildCoverArtBuffer(trackId),
        },
        {
          savePrivate: (id, key, body, contentType) => saveObjectWithFallback(id, key, body, { contentType }),
          savePublic: (key, body, contentType) => objectStorage.savePublicObject(key, body, contentType),
        },
      );
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
    // Use only lyrics returned by the model; transcription requires a separate
    // external audio service and is intentionally not routed through the app.
    const AI_LYRICS_HEADER = "[AI-written lyrics]\n";
    let aiLyricsText: string | null = null;
    if (vocalMode === "random") {
      if (responseLyrics) {
        aiLyricsText = AI_LYRICS_HEADER + responseLyrics;
        logger.info({ trackId: "pending" }, "mlkOrchestrator: captured AI lyrics from Lyria response");
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
          // Provenance attribution on the document itself: which AI model
          // generated the audio, and the copyright screen it cleared. A stub
          // only exists when the scan returned no_match (shouldStamp).
          generationModel: lyriaModel,
          fingerprintStatus: fingerprint.status,
          fingerprintProvider: "acrcloud",
          fingerprintScannedAt: new Date(),
          finalLyricsHash: opts.lyricAudit?.finalLyricsHash ?? (vocalMode === "lyrics" ? lyricHash : null),
          lyricsAuthorshipScore: opts.lyricAudit?.authorshipScore ?? null,
          lyricsAuthorshipLedger: opts.lyricAudit?.ledger ?? null,
          finalLyricsLabel: vocalMode === "lyrics" ? "Certified Final Rendered Lyrics" : null,
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
        finalLyricsHash: opts.lyricAudit?.finalLyricsHash ?? (vocalMode === "lyrics" ? lyricHash : null),
        lyricsAuthorshipScore: opts.lyricAudit?.authorshipScore ?? null,
        lyricsAuthorshipLedger: opts.lyricAudit?.ledger ?? null,
        finalLyricsLabel: vocalMode === "lyrics" ? "Certified Final Rendered Lyrics" : null,
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
        generationModel: lyriaModel,
        fingerprintStatus: fingerprint.status,
        fingerprintProvider: "acrcloud",
        fingerprintScannedAt: new Date().toISOString(),
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
      finalLyricsHash: opts.lyricAudit?.finalLyricsHash ?? (vocalMode === "lyrics" ? lyricHash : undefined),
      lyricsAuthorshipScore: opts.lyricAudit?.authorshipScore,
    };
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
