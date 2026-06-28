/**
 * Replicate Demucs htdemucs separation provider.
 *
 * Primary separation engine for voice_remove and stem_split.
 * Uploads audio to Replicate Files API → runs ryan5453/demucs → downloads
 * stems → carves each through MLK v3 (ffmpeg-native applyMLKv3Fast).
 *
 * Never crashes the route: callers must try/catch and fall back to DSP.
 */

import { readFile, writeFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { zipSync } from "fflate";
import { uploadFile, runModel, isConfigured } from "./replicateClient";
import { applyMLKv3Fast } from "./kernel-v3";

export { isConfigured };

const execFileAsync = promisify(execFile);

export const REPLICATE_PROTOCOL = "GravelKing_Neural_Separator_v1";
export const REPLICATE_MODEL    = "htdemucs";
export const REPLICATE_KERNEL   = "MLK_v3";
export const REPLICATE_STACK    = `${REPLICATE_PROTOCOL}+Demucs_htdemucs+${REPLICATE_KERNEL}`;

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Demucs stem download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseStemUrls(output: unknown): Record<string, string> {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error(`Unexpected Demucs output shape: ${JSON.stringify(output)}`);
  }
  const raw = output as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.startsWith("http")) result[k] = v;
  }
  if (Object.keys(result).length === 0) {
    throw new Error(`No stem URLs in Demucs output: ${JSON.stringify(output)}`);
  }
  return result;
}

/**
 * Voice removal via Replicate Demucs htdemucs (two_stems=vocals).
 * Returns a shape compatible with mlkVocalRemoval.
 */
export async function replicateVoiceRemove(
  filePath: string,
  multiplier = 0.75,
): Promise<{
  instrumental: Buffer;
  kernelParity: string;
  protocol: string;
  model: string;
  stack: string;
}> {
  const audioBuf = await readFile(filePath);
  const audioUrl = await uploadFile(audioBuf, "input.wav", "audio/wav");

  const output = await runModel(
    "ryan5453",
    "demucs",
    { audio: audioUrl, model: "htdemucs", two_stems: "vocals", output_format: "wav" },
    // 60 s: if Demucs hasn't responded, fall back to DSP immediately so the HTTP
    // connection stays well within Replit's 4-min proxy timeout / SIGTERM window.
    60_000,
  );

  const stemUrls = parseStemUrls(output);

  const instUrl =
    stemUrls["no_vocals"] ??
    stemUrls["accompaniment"] ??
    stemUrls["no_vocal"] ??
    stemUrls["instrumental"];

  if (!instUrl) {
    throw new Error(
      `No instrumental stem in Demucs output. Keys: ${Object.keys(stemUrls).join(", ")}`,
    );
  }

  const instRaw = await downloadToBuffer(instUrl);
  const carved = await applyMLKv3Fast(instRaw, multiplier);

  return {
    instrumental: carved.buf,
    kernelParity: carved.parity,
    protocol: REPLICATE_PROTOCOL,
    model: REPLICATE_MODEL,
    stack: REPLICATE_STACK,
  };
}

const CANONICAL_STEMS = ["vocals", "drums", "bass", "other"] as const;

/**
 * 4-stem split via Replicate Demucs htdemucs.
 * Returns a shape compatible with mlkStemSplit (GNSResult).
 */
export async function replicateStemSplit(
  filePath: string,
  multiplier = 0.75,
): Promise<{
  zipBuffer: Buffer;
  protocol: string;
  model: string;
  stems: string[];
  kernelParity: string;
  stack: string;
}> {
  const audioBuf = await readFile(filePath);
  const audioUrl = await uploadFile(audioBuf, "input.wav", "audio/wav");

  const output = await runModel(
    "ryan5453",
    "demucs",
    { audio: audioUrl, model: "htdemucs", output_format: "wav" },
    // 90 s: 4-stem is slower than 2-stem; still well inside Replit's proxy window.
    90_000,
  );

  const stemUrls = parseStemUrls(output);

  // Collect stems: prefer canonical order, then any extras the model returned
  const orderedEntries: { name: string; url: string }[] = [];
  for (const name of CANONICAL_STEMS) {
    if (stemUrls[name]) orderedEntries.push({ name, url: stemUrls[name]! });
  }
  for (const [k, v] of Object.entries(stemUrls)) {
    if (!(CANONICAL_STEMS as readonly string[]).includes(k)) {
      orderedEntries.push({ name: k, url: v });
    }
  }
  if (orderedEntries.length === 0) {
    throw new Error("Replicate Demucs returned no stem URLs");
  }

  const mixId = randomUUID();
  const tmpPaths: Record<string, string> = {};

  try {
    // Download all stems to /tmp
    await Promise.all(
      orderedEntries.map(async ({ name, url }) => {
        const p = `/tmp/gk_replic_${mixId}_${name}.wav`;
        await writeFile(p, await downloadToBuffer(url));
        tmpPaths[name] = p;
      }),
    );

    // Carve each stem via MLK v3 Fast (ffmpeg-native — never JS applyMLKv3 on large buffers)
    const carvedBufs: Record<string, { buf: Buffer; parity: string }> = {};
    await Promise.all(
      Object.entries(tmpPaths).map(async ([name, p]) => {
        const raw = await readFile(p);
        carvedBufs[name] = await applyMLKv3Fast(raw, multiplier);
      }),
    );

    // Mix raw non-vocal stems → one instrumental track → carve
    const nonVocalPaths = Object.entries(tmpPaths)
      .filter(([name]) => name !== "vocals")
      .map(([, p]) => p);

    let instrumentalCarved: { buf: Buffer; parity: string } | null = null;
    if (nonVocalPaths.length > 0) {
      const outPath = `/tmp/gk_replic_inst_${mixId}.wav`;
      try {
        const inputArgs = nonVocalPaths.flatMap((p) => ["-i", p]);
        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            ...inputArgs,
            "-filter_complex",
            `amix=inputs=${nonVocalPaths.length}:normalize=0`,
            "-acodec",
            "pcm_s16le",
            outPath,
          ],
          { maxBuffer: 200 * 1024 * 1024, timeout: 120_000 },
        );
        const instRaw = await readFile(outPath);
        instrumentalCarved = await applyMLKv3Fast(instRaw, multiplier);
      } finally {
        await unlink(outPath).catch(() => {});
      }
    }

    // Build zip
    const zipEntries: Record<string, Uint8Array> = {};
    for (const [name, { buf }] of Object.entries(carvedBufs)) {
      zipEntries[`${name}.wav`] = new Uint8Array(buf);
    }
    if (instrumentalCarved) {
      zipEntries["instrumental.wav"] = new Uint8Array(instrumentalCarved.buf);
    }

    const stemNames = [
      ...Object.keys(carvedBufs),
      ...(instrumentalCarved ? ["instrumental"] : []),
    ];

    const kernelParity =
      instrumentalCarved?.parity ??
      Object.values(carvedBufs)[0]?.parity ??
      "REPLICATE_DEMUCS";

    return {
      zipBuffer: Buffer.from(zipSync(zipEntries)),
      protocol: REPLICATE_PROTOCOL,
      model: REPLICATE_MODEL,
      stems: stemNames,
      kernelParity,
      stack: REPLICATE_STACK,
    };
  } finally {
    await Promise.all(Object.values(tmpPaths).map((p) => unlink(p).catch(() => {})));
  }
}
