import { setTimeout as sleep } from "node:timers/promises";

import { Storage } from "@google-cloud/storage";
import { unzipSync, zipSync } from "fflate";

const REPLICATE_BASE = "https://api.replicate.com/v1";
const TRAINER_MODEL = "replicate/train-rvc-model";
const DATASET_URL =
  "https://www.dropbox.com/scl/fi/k7ujxiy2bzt4jcnijlr8c/VoiceAudio.wav?rlkey=48iwn7qo57itnps5e0d6dqkeb&dl=1";
const MODEL_NAME = "gravelking_v2";
const PTH_KEY = `models/${MODEL_NAME}.pth`;
const INDEX_KEY = `models/${MODEL_NAME}.index`;
const POLL_INTERVAL_MS = 15_000;
const TRAINING_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  logs?: string | null;
  urls?: { get?: string };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function resumePredictionId(): string | undefined {
  const position = process.argv.indexOf("--prediction-id");
  if (position === -1) return undefined;
  const value = process.argv[position + 1]?.trim();
  if (!value) throw new Error("--prediction-id requires a Replicate prediction ID");
  return value;
}

async function responseBuffer(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function replicateFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${REPLICATE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 1_000);
    throw new Error(`Replicate request failed (${response.status} ${path}): ${body}`);
  }
  return response;
}

async function uploadDataset(token: string, datasetZip: Buffer): Promise<string> {
  const form = new FormData();
  form.append(
    "content",
    new Blob([new Uint8Array(datasetZip)], { type: "application/zip" }),
    `${MODEL_NAME}_dataset.zip`,
  );
  const response = await replicateFetch(token, "/files", {
    method: "POST",
    body: form,
  });
  const result = (await response.json()) as {
    urls?: { get?: string };
    url?: string;
  };
  const url = result.urls?.get ?? result.url;
  if (!url) throw new Error("Replicate dataset upload returned no URL");
  return url;
}

async function startTraining(
  token: string,
  datasetZipUrl: string,
): Promise<ReplicatePrediction> {
  const modelResponse = await replicateFetch(token, `/models/${TRAINER_MODEL}`);
  const model = (await modelResponse.json()) as {
    latest_version?: { id?: string };
  };
  const version = model.latest_version?.id;
  if (!version) throw new Error(`${TRAINER_MODEL} has no released version`);

  const response = await replicateFetch(token, "/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      version,
      input: {
        dataset_zip: datasetZipUrl,
        sample_rate: "40k",
        version: "v2",
        f0method: "rmvpe_gpu",
        epoch: 150,
        batch_size: "7",
      },
    }),
  });
  return (await response.json()) as ReplicatePrediction;
}

async function waitForTraining(
  token: string,
  initial: ReplicatePrediction,
): Promise<ReplicatePrediction> {
  let prediction = initial;
  const deadline = Date.now() + TRAINING_TIMEOUT_MS;
  let lastLogLength = 0;

  while (prediction.status === "starting" || prediction.status === "processing") {
    if (Date.now() >= deadline) {
      throw new Error(`Replicate training ${prediction.id} exceeded the 3-hour deadline`);
    }
    if (prediction.logs && prediction.logs.length > lastLogLength) {
      const delta = prediction.logs.slice(lastLogLength).trim();
      if (delta) console.log(delta);
      lastLogLength = prediction.logs.length;
    }
    console.log(`[train-rvc] ${prediction.id}: ${prediction.status}`);
    await sleep(POLL_INTERVAL_MS);
    const getPath = prediction.urls?.get
      ? new URL(prediction.urls.get).pathname.replace(/^\/v1/, "")
      : `/predictions/${prediction.id}`;
    const response = await replicateFetch(token, getPath);
    prediction = (await response.json()) as ReplicatePrediction;
  }

  if (prediction.status !== "succeeded") {
    throw new Error(
      `Replicate training ${prediction.id} ${prediction.status}: ${prediction.error ?? "unknown error"}`,
    );
  }
  return prediction;
}

async function getPrediction(
  token: string,
  predictionId: string,
): Promise<ReplicatePrediction> {
  const response = await replicateFetch(token, `/predictions/${predictionId}`);
  return (await response.json()) as ReplicatePrediction;
}

function outputUrl(output: unknown): string {
  if (typeof output === "string" && /^https:\/\//.test(output)) return output;
  if (output && typeof output === "object") {
    const candidate = output as { url?: unknown; href?: unknown };
    if (typeof candidate.url === "string") return candidate.url;
    if (typeof candidate.href === "string") return candidate.href;
  }
  throw new Error("Replicate training returned no output archive URL");
}

function selectWeight(
  files: Record<string, Uint8Array>,
  extension: ".pth" | ".index",
): Buffer {
  const candidates = Object.entries(files)
    .filter(([name]) => name.toLowerCase().endsWith(extension))
    .sort((left, right) => right[1].byteLength - left[1].byteLength);
  const selected = candidates[0];
  if (!selected) throw new Error(`Training archive contains no ${extension} artifact`);
  console.log(`[train-rvc] selected ${selected[0]} (${selected[1].byteLength} bytes)`);
  return Buffer.from(selected[1]);
}

function managedStorage(): Storage {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

async function saveWeights(
  targetBucket: string,
  artifacts: Array<{ key: string; body: Buffer }>,
): Promise<string> {
  try {
    const storage = managedStorage();
    await Promise.all(
      artifacts.map(({ key, body }) =>
        storage.bucket(targetBucket).file(key).save(body, {
          contentType: "application/octet-stream",
          resumable: false,
        }),
      ),
    );
    return targetBucket;
  } catch (primaryError) {
    const rawCredentials = requireEnv("GCP_SERVICE_ACCOUNT");
    const credentials = JSON.parse(rawCredentials) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
      throw primaryError;
    }
    const fallbackBucket = `gkp-vault-${credentials.project_id}`;
    console.warn(
      `[train-rvc] managed bucket rejected writes; using configured Object Storage fallback ${fallbackBucket}`,
    );
    const storage = new Storage({
      credentials,
      projectId: credentials.project_id,
    });
    await Promise.all(
      artifacts.map(({ key, body }) =>
        storage.bucket(fallbackBucket).file(key).save(body, {
          contentType: "application/octet-stream",
          resumable: false,
        }),
      ),
    );
    return fallbackBucket;
  }
}

async function main(): Promise<void> {
  const token = requireEnv("REPLICATE_API_TOKEN");
  const bucketId = requireEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID");
  const existingPredictionId = resumePredictionId();
  let completed: ReplicatePrediction;
  if (existingPredictionId) {
    console.log(`[train-rvc] resuming prediction: ${existingPredictionId}`);
    completed = await waitForTraining(
      token,
      await getPrediction(token, existingPredictionId),
    );
  } else {
    console.log("[train-rvc] downloading source audio into memory");
    const datasetResponse = await fetch(DATASET_URL, { redirect: "follow" });
    if (!datasetResponse.ok) {
      throw new Error(`Dataset download failed (${datasetResponse.status})`);
    }
    const sourceWav = await responseBuffer(datasetResponse);
    if (sourceWav.length < 12 || sourceWav.toString("ascii", 0, 4) !== "RIFF") {
      throw new Error("Dataset URL did not return a RIFF WAV file");
    }

    console.log("[train-rvc] creating in-memory dataset archive");
    const datasetZip = Buffer.from(
      zipSync(
        { [`dataset/${MODEL_NAME}/split_0.wav`]: new Uint8Array(sourceWav) },
        { level: 0 },
      ),
    );
    const datasetZipUrl = await uploadDataset(token, datasetZip);
    console.log("[train-rvc] submitted dataset to Replicate Files");

    const initial = await startTraining(token, datasetZipUrl);
    console.log(`[train-rvc] training started: ${initial.id}`);
    completed = await waitForTraining(token, initial);
  }

  console.log("[train-rvc] downloading output archive into memory");
  const outputResponse = await fetch(outputUrl(completed.output), {
    headers: { Authorization: `Token ${token}` },
  });
  if (!outputResponse.ok) {
    throw new Error(`Training output download failed (${outputResponse.status})`);
  }
  const outputZip = await responseBuffer(outputResponse);
  const weights = unzipSync(new Uint8Array(outputZip));
  const pth = selectWeight(weights, ".pth");
  const index = selectWeight(weights, ".index");

  console.log("[train-rvc] streaming model buffers to Object Storage");
  const storageBucket = await saveWeights(bucketId, [
    { key: PTH_KEY, body: pth },
    { key: INDEX_KEY, body: index },
  ]);

  console.log(`[train-rvc] Object Storage bucket: ${storageBucket}`);
  console.log(`[train-rvc] Object Storage key: ${PTH_KEY}`);
  console.log(`[train-rvc] Object Storage key: ${INDEX_KEY}`);
}

main().catch((error: unknown) => {
  console.error(`[train-rvc] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});