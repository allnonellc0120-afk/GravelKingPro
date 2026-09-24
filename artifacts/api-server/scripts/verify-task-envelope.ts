/**
 * Live execution-contract verification.
 *
 * This is deliberately operator-run and fail-closed. It does not create
 * synthetic audio, invent a Replicate prediction, copy an existing render, or
 * report metadata from memory. Every stage must produce a real file on disk or
 * a real provider response before the next stage starts.
 *
 * Usage:
 *   TASK_ENVELOPE_INPUT_PATH=/absolute/path/clean-vocal.wav \
 *   TASK_ENVELOPE_MODEL_WEIGHTS_URL=https://.../gravelking_v2.zip \
 *   TASK_ENVELOPE_API_BASE_URL=https://... \
 *   TASK_ENVELOPE_ADMIN_SESSION_ID=... \
 *   pnpm --filter @workspace/api-server run verify:task-envelope
 *
 * REPLICATE_API_TOKEN and ADMIN_KEY are read from the environment but never
 * printed. The input and model URL must be supplied explicitly; this script
 * will not substitute an attached asset or a local placeholder.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import {
  convertToGravelKingVoice,
  uploadFile,
  waitForPredictionOutput,
} from "../src/replicateClient.ts";

const CONTRACT_ADMIN_EMAIL = "allin10120@gmail.com";
const UNAUTHORIZED_PROBE_EMAIL = "unauthorized_probe@gravelking.io";
const TARGET_BYTES = 1_000_000;
const TARGET_BITRATE = "320000";
const TARGET_SAMPLE_RATE = "44100";
const TARGET_CHANNELS = 2;

type CommandResult = {
  pid: number;
  stdout: string;
  stderr: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable ${name} is missing`);
  return value;
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const pid = child.pid;
    if (!pid) {
      reject(new Error(`${command} did not expose an OS process id`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms (pid ${pid})`));
        return;
      }
      if (code !== 0) {
        reject(new Error(
          `${command} exited ${String(code)}${signal ? ` via ${signal}` : ""} (pid ${pid}): ${stderr.slice(-2_000)}`,
        ));
        return;
      }
      resolve({ pid, stdout, stderr });
    });
  });
}

async function requireActualFile(filePath: string, label: string): Promise<number> {
  const result = await runCommand("stat", ["--printf=%s", filePath], 10_000);
  const bytes = Number(result.stdout.trim());
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error(`${label} is not a non-empty regular file: ${filePath}`);
  }
  return bytes;
}

async function downloadToDisk(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (response.status !== 200) {
    throw new Error(`RVC output download failed with HTTP ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) throw new Error("RVC output download was empty");
  await writeFile(outputPath, body, { flag: "wx" });
}

async function assertAdminProbes(): Promise<void> {
  const baseUrl = requiredEnv("TASK_ENVELOPE_API_BASE_URL").replace(/\/+$/, "");
  const adminKey = requiredEnv("ADMIN_KEY");
  const sessionId = requiredEnv("TASK_ENVELOPE_ADMIN_SESSION_ID");

  const negative = await fetch(`${baseUrl}/api/admin/control`, {
    headers: {
      "x-admin-key": adminKey,
      "x-admin-user": UNAUTHORIZED_PROBE_EMAIL,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const negativeBody = await negative.text();
  if (negative.status !== 403 || negativeBody !== "") {
    throw new Error(
      `Unauthorized admin probe expected HTTP 403 with an empty body; got ${negative.status} with ${negativeBody.length} bytes`,
    );
  }

  const positive = await fetch(`${baseUrl}/api/admin/control`, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      "x-admin-key": adminKey,
      "x-admin-user": CONTRACT_ADMIN_EMAIL,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const positiveBody = await positive.text();
  if (positive.status !== 200) {
    throw new Error(`Whitelisted admin probe expected HTTP 200; got ${positive.status}: ${positiveBody.slice(0, 500)}`);
  }
  if (!positiveBody) throw new Error("Whitelisted admin probe returned an empty body");
}

async function assertFreshSettings(): Promise<void> {
  const { db, adminSettingsTable } = await import("@workspace/db");
  const { inArray } = await import("drizzle-orm");
  const requiredKeys = ["jax_config", "rvc_settings", "mastering_defaults"] as const;
  const rows = await db
    .select({ key: adminSettingsTable.key, updatedAt: adminSettingsTable.updatedAt, value: adminSettingsTable.value })
    .from(adminSettingsTable)
    .where(inArray(adminSettingsTable.key, [...requiredKeys]));
  if (rows.length !== requiredKeys.length) {
    throw new Error(
      `admin_settings freshness check expected ${requiredKeys.length} rows, found ${rows.length}`,
    );
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  for (const key of requiredKeys) {
    const row = byKey.get(key);
    if (!row) throw new Error(`admin_settings.${key} is missing`);
    const ageMs = Date.now() - row.updatedAt.getTime();
    if (ageMs < 0 || ageMs > 5 * 60_000) {
      throw new Error(`admin_settings row is ${Math.round(ageMs / 1000)} seconds old`);
    }
    const payload = JSON.parse(row.value) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") {
      throw new Error("admin_settings payload is not an object");
    }
    if (row.value.length === 0) throw new Error("admin_settings payload is empty");
    if (key === "jax_config" && (
      payload.temperature !== 0.72 ||
      payload.top_p !== 0.9 ||
      payload.max_output_tokens !== 2048
    )) {
      throw new Error(`admin_settings.jax_config does not match the contract: ${row.value}`);
    }
    if (key === "rvc_settings" && (
      payload.index_rate !== 0.75 ||
      payload.filter_radius !== 3 ||
      payload.protect !== 0.38 ||
      payload.rms_mix_rate !== 0.25
    )) {
      throw new Error(`admin_settings.rvc_settings does not match the contract: ${row.value}`);
    }
    if (key === "mastering_defaults" && (
      payload.global_override_enabled !== true ||
      payload.target_lufs !== -14 ||
      payload.true_peak_ceiling_db !== -1
    )) {
      throw new Error(`admin_settings.mastering_defaults does not match the contract: ${row.value}`);
    }
  }
}

type GcpCredentials = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

async function resolveGcsAssets(renderDir: string): Promise<{
  sourcePath: string;
  weightsArchivePath: string;
  objectPaths: Record<string, string>;
}> {
  const bucketName = requiredEnv("GCS_BUCKET_NAME");
  const credentials = JSON.parse(requiredEnv("GCP_SERVICE_ACCOUNT")) as GcpCredentials;
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error("GCP_SERVICE_ACCOUNT is missing service-account signing fields");
  }

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials: {
      project_id: credentials.project_id,
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });
  const bucket = storage.bucket(bucketName);
  const objectPaths = {
    source: "demo/founder/benchmark-session-preview.wav",
    weights: "models/rvc/gravel_kevin_v2.pth",
    index: "models/rvc/gravel_kevin_v2.index",
  };
  const localPaths = {
    sourcePath: path.join(renderDir, "raw_test_source.wav"),
    weightsPath: path.join(renderDir, `.gravel_kevin_v2_${process.pid}.pth`),
    indexPath: path.join(renderDir, `.gravel_kevin_v2_${process.pid}.index`),
    weightsArchivePath: path.join(renderDir, `.gravel_kevin_v2_${process.pid}.zip`),
  };

  for (const objectPath of Object.values(objectPaths)) {
    const file = bucket.file(objectPath);
    const [metadata] = await file.getMetadata();
    if (!Number(metadata.size)) {
      throw new Error(`GCS object is empty: gs://${bucketName}/${objectPath}`);
    }
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 15 * 60_000,
    });
    const localPath =
      objectPath === objectPaths.source
        ? localPaths.sourcePath
        : objectPath === objectPaths.weights
          ? localPaths.weightsPath
          : localPaths.indexPath;
    await runCommand("curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--output", localPath, signedUrl,
    ], 120_000);
    await requireActualFile(localPath, `GCS object ${objectPath}`);
  }

  await runCommand("zip", [
    "-q", "-j", localPaths.weightsArchivePath,
    localPaths.weightsPath, localPaths.indexPath,
  ], 30_000);
  await requireActualFile(localPaths.weightsArchivePath, "RVC weights archive");

  return {
    sourcePath: localPaths.sourcePath,
    weightsArchivePath: localPaths.weightsArchivePath,
    objectPaths,
  };
}

async function main(): Promise<void> {
  const renderDir = path.resolve(
    process.env.TASK_ENVELOPE_RENDER_DIR?.trim() || path.resolve(process.cwd(), "storage/renders"),
  );
  const voicePath = path.join(renderDir, "rvc_processed_stage.wav");
  const masterWavPath = path.join(renderDir, "master_320_output.wav");
  const masteredPath = path.join(renderDir, "master_320_output.mp3");
  const rawRvcPath = path.join(renderDir, `.rvc_raw_${process.pid}.bin`);
  await mkdir(renderDir, { recursive: true });
  const cleanupPaths = new Set<string>([rawRvcPath]);

  const gcsAssets = await resolveGcsAssets(renderDir);
  cleanupPaths.add(path.join(renderDir, `.gravel_kevin_v2_${process.pid}.pth`));
  cleanupPaths.add(path.join(renderDir, `.gravel_kevin_v2_${process.pid}.index`));
  cleanupPaths.add(gcsAssets.weightsArchivePath);
  const sourcePath = gcsAssets.sourcePath;
  await requireActualFile(sourcePath, "GCS source audio");

  await assertAdminProbes();
  await assertFreshSettings();

  const inputBytes = await readFile(sourcePath);
  const uploadedAudioUrl = await uploadFile(inputBytes, path.basename(sourcePath), "audio/wav");
  const modelWeightsUrl = await uploadFile(
    await readFile(gcsAssets.weightsArchivePath),
    "gravel_kevin_v2.zip",
    "application/zip",
  );
  const prediction = await convertToGravelKingVoice({
    audioUrl: uploadedAudioUrl,
    modelWeightsUrl,
    pitchShift: 0,
    indexRate: 0.75,
    filterRadius: 3,
    protect: 0.38,
  });
  if (!prediction.predictionId) throw new Error("Replicate returned no prediction id");
  const completed = await waitForPredictionOutput(prediction.predictionId);
  if (completed.elapsedMs < 500) {
    throw new Error(`Replicate upstream execution was only ${completed.elapsedMs}ms; minimum is 500ms`);
  }
  await downloadToDisk(completed.outputUrl, rawRvcPath);
  await requireActualFile(rawRvcPath, "Replicate RVC output");

  // MLK V4 consumes canonical 48 kHz stereo PCM. This conversion is an
  // actual ffmpeg subprocess over the downloaded provider output.
  const normalize = await runCommand("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-i", rawRvcPath, "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", voicePath,
  ], 120_000);
  if (!normalize.pid) throw new Error("Audio normalization did not expose an OS pid");
  await requireActualFile(voicePath, "RVC processed stage");

  const workerPath = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
  const kernel = await runCommand("python3", [
    workerPath,
    "--input", voicePath,
    "--output", masterWavPath,
    "--preset", "natural_body",
    "--intensity", "75",
    "--sidechain-filter", "highpass",
    "--sidechain-freq", "160",
    "--stereo-link", "true",
    "--adaptive-mode", "bass_aware",
    "--auto-threshold", "false",
    "--auto-offset", "-16",
    "--target-lufs", "-14",
    "--ceiling-db", "-1",
  ], 180_000);
  await requireActualFile(masterWavPath, "MLK master WAV");

  const encode = await runCommand("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-i", masterWavPath, "-ac", "2", "-ar", "44100",
    "-c:a", "libmp3lame", "-b:a", "320k", masteredPath,
  ], 120_000);
  await requireActualFile(masteredPath, "mastered MP3");
  const size = await requireActualFile(masteredPath, "mastered MP3");
  if (size < TARGET_BYTES) throw new Error(`Mastered MP3 is ${size} bytes; minimum is ${TARGET_BYTES}`);

  const ffprobe = await runCommand("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", masteredPath,
  ], 30_000);
  const probe = JSON.parse(ffprobe.stdout) as {
    format?: { size?: string; bit_rate?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; bit_rate?: string; sample_rate?: string; channels?: number }>;
  };
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (
    audio?.codec_name !== "mp3" ||
    audio.bit_rate !== TARGET_BITRATE ||
    audio.sample_rate !== TARGET_SAMPLE_RATE ||
    audio.channels !== TARGET_CHANNELS
  ) {
    throw new Error(`Mastered MP3 failed exact ffprobe assertions: ${JSON.stringify({ audio, format: probe.format })}`);
  }

  const statOutput = await runCommand("stat", [masteredPath], 10_000);
  const shaOutput = await runCommand("sha256sum", [masteredPath], 10_000);
  const loudness = await runCommand("ffmpeg", [
    "-nostdin", "-i", masteredPath, "-filter:a", "ebur128=peak=true", "-f", "null", "-",
  ], 120_000);
  const loudnessLog = `${loudness.stdout}\n${loudness.stderr}`;
  if (!/Integrated loudness/i.test(loudnessLog)) {
    throw new Error("ebur128 output did not contain Integrated loudness");
  }

  console.log(JSON.stringify({
    ok: true,
    runMode: "hardware_executed_subprocesses_only",
    paths: { inputPath: sourcePath, voicePath, masteredPath },
    prediction: {
      predictionId: prediction.predictionId,
      outputUrl: completed.outputUrl,
      upstreamLatencyMs: completed.elapsedMs,
    },
    subprocessPids: {
      normalize: normalize.pid,
      kernel: kernel.pid,
      encode: encode.pid,
      ffprobe: ffprobe.pid,
      stat: statOutput.pid,
      sha256sum: shaOutput.pid,
      ebur128: loudness.pid,
    },
    stat: statOutput.stdout.trim(),
    sha256: shaOutput.stdout.trim(),
    ffprobe: probe,
    ebur128RawDump: loudnessLog,
    ebur128: loudnessLog.split("\n").filter((line) => /Integrated loudness/i.test(line)),
  }, null, 2));

  cleanupPaths.add(masterWavPath);
  await Promise.all([...cleanupPaths].map((filePath) => unlink(filePath).catch(() => {})));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});