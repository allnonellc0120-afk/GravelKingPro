import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  ACTIVE_RVC_VOICE_PRESET_ID,
  convertToGravelKingVoice,
  createPrediction,
  waitForPredictionOutput,
} from "../replicateClient";
import { compressJaxSal } from "../lib/jaxSal";

const SOURCE_TTS_MODEL = {
  owner: "jaaari",
  name: "kokoro-82m",
} as const;
const SOURCE_TTS_TIMEOUT_MS = 20_000;
const FOUNDER_RVC_TIMEOUT_MS = 180_000;
const CACHE_TTL_MS = 15 * 60_000;
const MAX_CACHE_ITEMS = 32;
export const FOUNDER_RVC_CHECKPOINT_URL =
  "https://replicate.delivery/xezq/BGtKs7ExX65aEBfeW2TFXvD0jQaXaMCLqVAuExUkrdpeAGhuA/founder_voice.zip";
export const FOUNDER_RVC_WEIGHTS_FILE = "founder_voice.pth";
export const FOUNDER_RVC_INDEX_FILE = "added_IVF159_Flat_nprobe_1_founder_voice_v2.index";
const execFileAsync = promisify(execFile);

type FounderAudio = { audio: Buffer; contentType: "audio/mpeg"; expiresAt: number };
const audioCache = new Map<string, { result: FounderTtsResult; audio: FounderAudio }>();

export type FounderTtsResult = {
  audioId: string;
  salText: string;
  voicePreset: string;
  sourcePredictionId: string | null;
  rvcPredictionId: string | null;
  elapsedMs: number;
  cacheHit: boolean;
};

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of audioCache) {
    if (entry.audio.expiresAt <= now) audioCache.delete(key);
  }
  while (audioCache.size > MAX_CACHE_ITEMS) {
    const oldest = audioCache.keys().next().value;
    if (!oldest) break;
    audioCache.delete(oldest);
  }
}

export function getFounderAudio(audioId: string): FounderAudio | null {
  pruneCache();
  for (const entry of audioCache.values()) {
    if (entry.result.audioId === audioId) return entry.audio;
  }
  return null;
}

async function applyVocalPunchPreset(inputUrl: string): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = `/tmp/jax_rvc_${id}.mp3`;
  const kernelInput = `/tmp/jax_kernel_${id}.wav`;
  const kernelOutput = `/tmp/jax_kernel_${id}_out.wav`;
  const finalOutput = `/tmp/jax_final_${id}.mp3`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(inputUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`RVC audio download failed with HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > 20 * 1024 * 1024) throw new Error("RVC audio payload is invalid.");
    await writeFile(inputPath, body);
    await execFileAsync("ffmpeg", [
      "-nostdin", "-y", "-i", inputPath, "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", kernelInput,
    ], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    const worker = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
    await execFileAsync("python3", [
      // The exposed "Vocal Punch / Phase Focus" preset is the podcast
      // delivery preset; MLK's Python kernel receives its validated base name.
      worker, "--input", kernelInput, "--output", kernelOutput, "--preset", "natural_body",
      "--intensity", "65", "--sidechain-filter", "highpass", "--sidechain-freq", "120",
      "--stereo-link", "true", "--adaptive-mode", "bass_aware", "--auto-threshold", "true",
      "--auto-offset", "-15.5", "--target-lufs", "-16", "--ceiling-db", "-1.5",
    ], { timeout: 45_000, maxBuffer: 8 * 1024 * 1024 });
    await execFileAsync("ffmpeg", [
      "-nostdin", "-y", "-i", kernelOutput, "-ac", "2", "-ar", "44100",
      "-codec:a", "libmp3lame", "-b:a", "96k", finalOutput,
    ], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    return await readFile(finalOutput);
  } finally {
    await Promise.all([inputPath, kernelInput, kernelOutput, finalOutput].map(path => unlink(path).catch(() => {})));
  }
}

/**
 * RVC converts existing audio; it does not synthesize text by itself. Generate
 * a neutral low-pitch speech source on Replicate, then convert that audio
 * through the configured founder RVC checkpoint.
 */
export async function synthesizeFounderVoice(
  text: string,
  requestOrigin?: string,
): Promise<FounderTtsResult> {
  const startedAt = Date.now();
  const salText = compressJaxSal(text, 30);
  pruneCache();
  const cached = audioCache.get(salText);
  if (cached) {
    return { ...cached.result, elapsedMs: Date.now() - startedAt, cacheHit: true };
  }
  const sourcePredictionId = await createPrediction(
    SOURCE_TTS_MODEL.owner,
    SOURCE_TTS_MODEL.name,
    {
      text: salText,
      voice: "am_adam",
      speed: 1,
    },
  );
  const source = await waitForPredictionOutput(sourcePredictionId, {
    timeoutMs: SOURCE_TTS_TIMEOUT_MS,
    pollMs: 1_500,
  });

  // This verified founder checkpoint is intentionally fixed for JAX TTS.
  // Other RVC generation paths continue to use the signed workspace model.
  const modelWeightsUrl = FOUNDER_RVC_CHECKPOINT_URL;
  const conversion = await convertToGravelKingVoice({
    audioUrl: source.outputUrl,
    modelWeightsUrl,
  });
  const founder = await waitForPredictionOutput(conversion.predictionId, {
    timeoutMs: FOUNDER_RVC_TIMEOUT_MS,
    pollMs: 2_000,
  });
  const audio = await applyVocalPunchPreset(founder.outputUrl);
  const audioId = randomUUID();
  const result: FounderTtsResult = {
    audioId,
    salText,
    voicePreset: ACTIVE_RVC_VOICE_PRESET_ID,
    sourcePredictionId,
    rvcPredictionId: conversion.predictionId,
    elapsedMs: Date.now() - startedAt,
    cacheHit: false,
  };
  audioCache.set(salText, {
    result,
    audio: { audio, contentType: "audio/mpeg", expiresAt: Date.now() + CACHE_TTL_MS },
  });
  pruneCache();

  return result;
}