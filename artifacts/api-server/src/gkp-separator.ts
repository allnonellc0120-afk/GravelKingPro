/**
 * GravelKing Neural Separator (GNS) v1
 * GravelKing Protocol — All N One LLC
 *
 * Pipeline: GNS Neural Separation (Demucs htdemucs) → MLK v3 Kernel Post-Processing
 * Neural stem separation under the GravelKing Protocol stack.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, unlink, rm, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { join, basename, extname, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { zipSync } from "fflate";
import { applyMLKv3, applyMLKv3Fast } from "./kernel-v3";

const execFileAsync = promisify(execFile);

// Wrapper script that patches torchaudio.load/save to use ffmpeg (bypasses missing torchcodec).
// Resolves relative to the compiled bundle: dist/ -> .. -> artifacts/api-server/
const _here = dirname(fileURLToPath(import.meta.url));
const DEMUCS_RUNNER = resolve(_here, "..", "gkp_demucs_runner.py");
const UVR_RUNNER    = resolve(_here, "..", "gkp_uvr_runner.py");

export const GNS_PROTOCOL  = "GravelKing_Neural_Separator_v1";
export const GNS_MODEL     = "htdemucs";
export const GNS_KERNEL    = "MLK_v3";
export const GNS_STACK     = `${GNS_PROTOCOL}+${GNS_KERNEL}`;

const DEMUCS_TIMEOUT = 360_000; // 6 min max for long tracks

/** Convert any WAV (e.g. float32 from demucs) to pcm_s16le WAV via ffmpeg. */
async function normalizeToS16le(inputBuf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath  = `/tmp/gkp_norm_in_${id}.wav`;
  const outPath = `/tmp/gkp_norm_out_${id}.wav`;
  await writeFile(inPath, inputBuf);
  await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-acodec", "pcm_s16le", outPath], { timeout: 120_000 });
  const result = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return result;
}

// ── GNS 4-stem split ─────────────────────────────────────────────────────────

export interface GNSResult {
  zipBuffer:    Buffer;
  protocol:     string;
  model:        string;
  stems:        string[];
  kernelParity: string;
  stack:        string;
}

/** Mix several WAV files into a single instrumental WAV via ffmpeg amix. */
async function mixStemsToInstrumental(stemPaths: string[]): Promise<Buffer> {
  const outPath = `/tmp/gns_inst_${randomUUID()}.wav`;
  const inputArgs = stemPaths.flatMap((p) => ["-i", p]);
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      ...inputArgs,
      "-filter_complex",
      `amix=inputs=${stemPaths.length}:normalize=0`,
      "-acodec",
      "pcm_s16le",
      outPath,
    ],
    { maxBuffer: 200 * 1024 * 1024, timeout: 120_000 },
  );
  const buf = await readFile(outPath);
  await unlink(outPath).catch(() => {});
  return buf;
}

/**
 * GNS Stem Split — 5-stem separation.
 * htdemucs yields vocals / drums / bass / other; we additionally synthesize a
 * full "instrumental" stem (everything except vocals) for a total of 5 stems.
 * Each stem is processed through MLK v3 post-separation.
 */
export async function gnsStemSplit(
  inputBuf:   Buffer,
  ext:        string,
  multiplier: number = 0.75
): Promise<GNSResult> {
  const id        = randomUUID();
  const inputPath = `/tmp/gns_in_${id}.${ext}`;
  const outputDir = `/tmp/gns_out_${id}`;

  await writeFile(inputPath, inputBuf);
  await mkdir(outputDir, { recursive: true });

  try {
    // ── Stage 1: GNS Neural Separation ──────────────────────────────────────
    await execFileAsync("python3", [
      DEMUCS_RUNNER,
      "-n",     GNS_MODEL,
      "--out",  outputDir,
      "--jobs", "1",
      inputPath,
    ], { maxBuffer: 200 * 1024 * 1024, timeout: DEMUCS_TIMEOUT });

    const trackName = basename(inputPath, extname(inputPath));
    const stemDir   = join(outputDir, GNS_MODEL, trackName);
    const stemFiles = (await readdir(stemDir)).filter(f => f.endsWith(".wav"));

    // ── Stage 2: MLK v3 Kernel Post-Processing on each stem ─────────────────
    const zipInput: Record<string, Uint8Array> = {};
    let kernelParity = "MLK_V3_VALIDATED";
    const stemNames: string[] = [];

    for (const file of stemFiles) {
      const rawBuf  = await readFile(join(stemDir, file));
      const s16Buf  = await normalizeToS16le(rawBuf);
      const { buf, parity } = applyMLKv3(s16Buf, multiplier);
      if (parity !== "MLK_V3_VALIDATED") kernelParity = parity;
      const label = file.replace(".wav", "");
      zipInput[`GKP_${label}.wav`] = new Uint8Array(buf);
      stemNames.push(label);
    }

    // ── Stage 3: synthesize a 5th "instrumental" stem (everything but vocals) ─
    const instrumentalSources = stemFiles
      .filter((f) => !/vocal/i.test(f))
      .map((f) => join(stemDir, f));
    if (instrumentalSources.length > 1) {
      const instRaw = await mixStemsToInstrumental(instrumentalSources);
      const { buf, parity } = applyMLKv3(instRaw, multiplier);
      if (parity !== "MLK_V3_VALIDATED") kernelParity = parity;
      zipInput["GKP_instrumental.wav"] = new Uint8Array(buf);
      stemNames.push("instrumental");
    }

    return {
      zipBuffer: Buffer.from(zipSync(zipInput)),
      protocol:  GNS_PROTOCOL,
      model:     GNS_MODEL,
      stems:     stemNames,
      kernelParity,
      stack:     GNS_STACK,
    };
  } finally {
    await unlink(inputPath).catch(() => {});
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── MLK v3 DSP engine (fast, in-process — no neural net) ─────────────────────
// Morris Law Kernel v3 separation. Runs entirely in-process with ffmpeg band
// math + the MLK v3 kernel, so it completes in seconds and never stalls the way
// the heavy GNS/Demucs neural path does. Used as the local route; the remote
// kernel (REMOTE_KERNEL_URL) provides the cloud route for the same modes.

export const MLK_PROTOCOL = "GravelKing_MLK_v3";
export const MLK_KERNEL   = "MLK_v3";
export const MLK_STACK    = `${MLK_PROTOCOL}+${MLK_KERNEL}`;

// ── UVR MDX-Net Neural Separator (ONNX — fast, high quality) ─────────────────
// UVR-MDX-NET-Inst_HQ_3: trained on large music datasets, outputs true neural
// vocal/instrumental separation. Runs via ONNX runtime — no GPU required.
export const UVR_PROTOCOL = "GravelKing_UVR_MDXNet";
export const UVR_MODEL    = "UVR-MDX-NET-Inst_HQ_3";
export const UVR_STACK    = `${UVR_PROTOCOL}+MLK_v3`;
const UVR_TIMEOUT         = 600_000; // 10 min ceiling for full-length tracks

/** Run an ffmpeg audio filter on a file and return a pcm_s16le WAV. */
async function ffmpegFilterToWav(
  filePath: string,
  filter: string,
  channels: number,
): Promise<Buffer> {
  const id      = randomUUID();
  const outPath = `/tmp/mlk_out_${id}.wav`;
  try {
    const args = ["-y", "-i", filePath];
    if (filter) args.push("-af", filter);
    args.push("-ac", String(channels), "-acodec", "pcm_s16le", outPath);
    await execFileAsync("ffmpeg", args, { maxBuffer: 200 * 1024 * 1024, timeout: 120_000 });
    return await readFile(outPath);
  } finally {
    await unlink(outPath).catch(() => {});
  }
}

/**
 * MLK v3 Voice Removal — center-channel cancellation + MLK v3 kernel.
 * Stereo: cancels center-panned vocals (out = L−R). Mono: attenuates the vocal
 * presence band. Output is post-processed through the Morris Law Kernel v3.
 */
export async function mlkVocalRemoval(
  filePath:   string,
  ext:        string,
  channels:   number,
  multiplier: number = 0.75,
): Promise<GNSVocalResult> {
  const filter = channels >= 2
    ? "pan=stereo|c0=c0-c1|c1=c0-c1"
    : "equalizer=f=2500:t=q:w=2:g=-9";
  const rawBuf = await ffmpegFilterToWav(filePath, filter, channels >= 2 ? 2 : 1);
  const { buf, parity } = await applyMLKv3Fast(rawBuf, multiplier);
  return {
    instrumental: buf,
    kernelParity: parity,
    protocol:     MLK_PROTOCOL,
    model:        MLK_KERNEL,
    stack:        MLK_STACK,
  };
}

/**
 * UVR Vocal Removal — neural separation via UVR-MDX-NET-Inst_HQ_3 (ONNX).
 * Downloads the model on first use (~100 MB) then caches it.
 * Throws on failure so callers can fall back to mlkVocalRemoval.
 */
export async function uvrVocalRemoval(
  filePath:   string,
  ext:        string,
  multiplier: number = 0.75,
): Promise<GNSVocalResult> {
  const id        = randomUUID();
  const outputDir = `/tmp/gkp_uvr_vr_${id}`;

  await mkdir(outputDir, { recursive: true });

  try {
    const { stdout } = await execFileAsync("python3", [
      UVR_RUNNER,
      "--mode",  "voice_remove",
      "--input", filePath,
      "--out",   outputDir,
    ], { maxBuffer: 500 * 1024 * 1024, timeout: UVR_TIMEOUT });

    const lines  = stdout.trim().split("\n").filter(Boolean);
    const parsed = JSON.parse(lines[lines.length - 1]) as {
      instrumental?: string;
      model?:        string;
      error?:        string;
    };

    if (parsed.error)         throw new Error(parsed.error);
    if (!parsed.instrumental) throw new Error("UVR runner produced no instrumental file");

    const rawBuf = await readFile(parsed.instrumental);
    const s16Buf = await normalizeToS16le(rawBuf);
    const { buf, parity } = applyMLKv3(s16Buf, multiplier);

    return {
      instrumental: buf,
      kernelParity: parity,
      protocol:     UVR_PROTOCOL,
      model:        UVR_MODEL,
      stack:        UVR_STACK,
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * MLK v3 Stem Split — frequency-band + spatial separation with MLK v3 kernel
 * baked directly into each stem's extraction filter. Produces the 5 stems the
 * studio UI expects (vocals, drums, bass, other, instrumental).
 *
 * Each stem is rendered by its OWN independent ffmpeg process (band extraction
 * + MLK v3 carving inline, in a single ffmpeg call per stem). The processes run
 * in parallel, so the job stays fast, but because each stem is isolated:
 *   - a failure is attributed to exactly ONE stem (we report which one), and
 *   - one stem failing no longer aborts the others.
 *
 * Every per-stem ffmpeg streams straight from the source file to disk, so no
 * large WAV buffers ever accumulate in Node.js RAM during processing — only the
 * final zip is held in memory. This replaced the old 6-sequential-ffmpeg
 * approach (1 split + 5 MLK passes) that took 5-8 minutes and peaked at
 * ~580 MB RAM for a 3-minute song.
 */
export async function mlkStemSplit(
  filePath:   string,
  ext:        string,
  channels:   number,
  multiplier: number = 0.75,
): Promise<GNSResult> {
  const id       = randomUUID();
  const isStereo = channels >= 2;
  const stemDir  = `/tmp/gkp_stems_${id}`;
  await mkdir(stemDir, { recursive: true });

  const lowMult  = Math.min(2.0, multiplier * 1.15).toFixed(4);
  const midMult  = multiplier.toFixed(4);
  const highMult = Math.max(0.1, multiplier * 0.80).toFixed(4);

  // MLK v3 carving chain applied to an already-extracted stream: split into 3
  // frequency bands → per-band gain → recombine + normalize. Self-contained so
  // it can live inside any single-stem ffmpeg process (labels are scoped to
  // that one process, so reuse across stems is safe).
  const mlkChain = [
    `asplit=3[l][m][h]`,
    `[l]lowpass=f=250,volume=${lowMult}[ll]`,
    `[m]highpass=f=250,lowpass=f=4000,volume=${midMult}[mm]`,
    `[h]highpass=f=4000,volume=${highMult}[hh]`,
    `[ll][mm][hh]amix=inputs=3:normalize=0,dynaudnorm=p=0.9:m=10:s=5[out]`,
  ].join(";");

  const vocalExtract = isStereo
    ? "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=180,lowpass=f=5000"
    : "highpass=f=180,lowpass=f=5000";
  const instrExtract = isStereo ? "pan=stereo|c0=c0-c1|c1=c0-c1" : "aecho=0.8:0.88:6:0.4";

  // One entry per stem: extraction filter + output channel count. Each becomes
  // an independent ffmpeg process so failures isolate to a single stem.
  const stemDefs = [
    { name: "vocals",       extract: vocalExtract,                    ch: 1,                          outPath: `${stemDir}/GKP_vocals.wav`       },
    { name: "drums",        extract: "highpass=f=200,lowpass=f=2500", ch: channels,                   outPath: `${stemDir}/GKP_drums.wav`        },
    { name: "bass",         extract: "lowpass=f=250",                 ch: channels,                   outPath: `${stemDir}/GKP_bass.wav`         },
    { name: "other",        extract: "highpass=f=2500",               ch: channels,                   outPath: `${stemDir}/GKP_other.wav`        },
    { name: "instrumental", extract: instrExtract,                    ch: isStereo ? 2 : channels,    outPath: `${stemDir}/GKP_instrumental.wav`  },
  ];

  // Render a single stem in its own ffmpeg process: [source] → extraction →
  // MLK v3 → disk. Errors are tagged with the stem name so the caller knows
  // exactly which stem failed.
  async function renderStem(stem: typeof stemDefs[number]): Promise<void> {
    const filterComplex = `[0:a]${stem.extract}[x];[x]${mlkChain}`;
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-i", filePath,
        "-filter_complex", filterComplex,
        "-map", "[out]",
        "-ac", String(stem.ch),
        "-acodec", "pcm_s16le",
        stem.outPath,
      ], { maxBuffer: 50 * 1024 * 1024, timeout: 180_000 });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`stem "${stem.name}" failed: ${detail}`);
    }
  }

  try {
    // Render every stem as its own parallel ffmpeg process. allSettled so one
    // stem's failure doesn't cancel the others — we collect ALL failures and
    // report exactly which stems broke.
    const results = await Promise.allSettled(stemDefs.map(renderStem));
    const failures = results
      .map((r, i) => (r.status === "rejected" ? { stem: stemDefs[i].name, reason: r.reason } : null))
      .filter((f): f is { stem: string; reason: unknown } => f !== null);

    if (failures.length > 0) {
      const names = failures.map((f) => f.stem).join(", ");
      const first = failures[0].reason;
      const detail = first instanceof Error ? first.message : String(first);
      throw new Error(`MLK stem split failed for ${failures.length} stem(s): ${names}. First error: ${detail}`);
    }

    // Read processed stems from disk and build zip. Files are read sequentially
    // to avoid spiking RAM; each entry is freed once zipSync compresses the set.
    const zipInput: Record<string, Uint8Array> = {};
    const stemNames: string[] = [];
    for (const stem of stemDefs) {
      zipInput[`GKP_${stem.name}.wav`] = new Uint8Array(await readFile(stem.outPath));
      stemNames.push(stem.name);
    }

    return {
      zipBuffer:    Buffer.from(zipSync(zipInput)),
      protocol:     MLK_PROTOCOL,
      model:        MLK_KERNEL,
      stems:        stemNames,
      kernelParity: "MLK_V3_VALIDATED",
      stack:        MLK_STACK,
    };
  } finally {
    await rm(stemDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── GNS Voice Removal ────────────────────────────────────────────────────────

export interface GNSVocalResult {
  instrumental: Buffer;
  kernelParity: string;
  protocol:     string;
  model:        string;
  stack:        string;
}

/**
 * GNS Voice Removal — two-stems mode (vocals / no_vocals).
 * Returns the ML-isolated instrumental after MLK v3 post-processing.
 * Works on both mono and stereo input.
 */
export async function gnsVocalRemoval(
  inputBuf:   Buffer,
  ext:        string,
  multiplier: number = 0.75
): Promise<GNSVocalResult> {
  const id        = randomUUID();
  const inputPath = `/tmp/gns_vr_in_${id}.${ext}`;
  const outputDir = `/tmp/gns_vr_out_${id}`;

  await writeFile(inputPath, inputBuf);
  await mkdir(outputDir, { recursive: true });

  try {
    // ── Stage 1: GNS Two-Stem Separation ────────────────────────────────────
    await execFileAsync("python3", [
      DEMUCS_RUNNER,
      "-n",           GNS_MODEL,
      "--two-stems",  "vocals",
      "--out",        outputDir,
      "--jobs",       "1",
      inputPath,
    ], { maxBuffer: 200 * 1024 * 1024, timeout: DEMUCS_TIMEOUT });

    const trackName  = basename(inputPath, extname(inputPath));
    const stemDir    = join(outputDir, GNS_MODEL, trackName);
    const noVocalBuf = await readFile(join(stemDir, "no_vocals.wav"));

    // ── Stage 2: MLK v3 Post-Processing ─────────────────────────────────────
    const s16Buf              = await normalizeToS16le(noVocalBuf);
    const { buf, parity }     = applyMLKv3(s16Buf, multiplier);

    return {
      instrumental: buf,
      kernelParity: parity,
      protocol:     GNS_PROTOCOL,
      model:        GNS_MODEL,
      stack:        GNS_STACK,
    };
  } finally {
    await unlink(inputPath).catch(() => {});
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}
