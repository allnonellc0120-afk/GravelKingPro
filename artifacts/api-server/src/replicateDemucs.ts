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

// Stem downloads are bounded by an AbortController so a stalled delivery URL
// can't hang the route + hold a concurrency slot; on timeout it throws → the
// caller falls back to DSP.
const STEM_DOWNLOAD_TIMEOUT_MS = 60_000;

async function downloadToBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEM_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Demucs stem download failed (${res.status}): ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Demucs stem download timed out after ${STEM_DOWNLOAD_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
    // `stem: "vocals"` puts the model in two-stem mode → returns `vocals` +
    // `no_vocals` (the instrumental). NOTE: the param is `stem`, NOT `two_stems`
    // (which this model ignores, defaulting to a full 4-stem split that has no
    // instrumental key).
    { audio: audioUrl, model: "htdemucs", stem: "vocals", output_format: "wav" },
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
 * 4-stem split (or 2-stem when onlyPrimaryStems=true) via Replicate Demucs htdemucs.
 *
 * onlyPrimaryStems=true  → two-stem Replicate run (vocals + no_vocals). Faster,
 *   lower bandwidth, produces exactly what the Voice Splitter page needs.
 * onlyPrimaryStems=false → full 4-stem run; all stems + synthesized instrumental
 *   are included in the ZIP for the DAW/Studio.
 *
 * ZIP keys always use the GKP_ prefix so the client can read them consistently.
 */
export async function replicateStemSplit(
  filePath: string,
  multiplier = 0.75,
  onlyPrimaryStems = false,
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

  // ── Two-stem mode (Voice Splitter) ────────────────────────────────────────
  if (onlyPrimaryStems) {
    const output = await runModel(
      "ryan5453",
      "demucs",
      { audio: audioUrl, model: "htdemucs", stem: "vocals", output_format: "wav" },
      90_000,
    );

    const stemUrls = parseStemUrls(output);
    const vocalUrl = stemUrls["vocals"];
    const instUrl  =
      stemUrls["no_vocals"] ??
      stemUrls["accompaniment"] ??
      stemUrls["no_vocal"] ??
      stemUrls["instrumental"];

    if (!vocalUrl || !instUrl) {
      throw new Error(
        `Replicate two-stem missing URLs. Keys: ${Object.keys(stemUrls).join(", ")}`,
      );
    }

    const mixId    = randomUUID();
    const vocalTmp = `/tmp/gk_replic_${mixId}_vocals.wav`;
    const instTmp  = `/tmp/gk_replic_${mixId}_inst.wav`;
    try {
      await Promise.all([
        writeFile(vocalTmp, await downloadToBuffer(vocalUrl)),
        writeFile(instTmp,  await downloadToBuffer(instUrl)),
      ]);

      const [vocalCarved, instCarved] = await Promise.all([
        applyMLKv3Fast(await readFile(vocalTmp), multiplier),
        applyMLKv3Fast(await readFile(instTmp),  multiplier),
      ]);

      return {
        zipBuffer: Buffer.from(
          zipSync({
            "GKP_vocals.wav":       new Uint8Array(vocalCarved.buf),
            "GKP_instrumental.wav": new Uint8Array(instCarved.buf),
          }),
        ),
        protocol:     REPLICATE_PROTOCOL,
        model:        REPLICATE_MODEL,
        stems:        ["vocals", "instrumental"],
        kernelParity: instCarved.parity,
        stack:        REPLICATE_STACK,
      };
    } finally {
      await Promise.all([unlink(vocalTmp).catch(() => {}), unlink(instTmp).catch(() => {})]);
    }
  }

  // ── Full 4-stem mode (Studio / DAW) ───────────────────────────────────────
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

    // Build zip — always use GKP_ prefix so clients can read consistently
    const zipEntries: Record<string, Uint8Array> = {};
    for (const [name, { buf }] of Object.entries(carvedBufs)) {
      zipEntries[`GKP_${name}.wav`] = new Uint8Array(buf);
    }
    if (instrumentalCarved) {
      zipEntries["GKP_instrumental.wav"] = new Uint8Array(instrumentalCarved.buf);
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
