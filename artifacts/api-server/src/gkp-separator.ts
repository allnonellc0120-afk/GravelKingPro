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
    ? "pan=stereo|c0=c0-c1|c1=c1-c0"
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
 * MLK v3 Stem Split — frequency-band + spatial separation, each band carved by
 * the Morris Law Kernel v3. Produces the 5 stems the studio UI expects
 * (vocals, drums, bass, other, instrumental).
 *
 * Uses a SINGLE multi-output ffmpeg call for band splitting so all 5 stems
 * are produced in ONE process, then runs MLK v3 carving SEQUENTIALLY (never
 * more than one ffmpeg at a time) — eliminating the 10-concurrent-process
 * spike that OOM-killed the container on real-world songs.
 */
export async function mlkStemSplit(
  filePath:   string,
  ext:        string,
  channels:   number,
  multiplier: number = 0.75,
): Promise<GNSResult> {
  const id       = randomUUID();
  const isStereo = channels >= 2;

  // Temp paths for the 5 band-split stems
  const stemDefs = [
    { name: "vocals",        outPath: `/tmp/gkp_stem_${id}_vocals.wav` },
    { name: "drums",         outPath: `/tmp/gkp_stem_${id}_drums.wav`  },
    { name: "bass",          outPath: `/tmp/gkp_stem_${id}_bass.wav`   },
    { name: "other",         outPath: `/tmp/gkp_stem_${id}_other.wav`  },
    { name: "instrumental",  outPath: `/tmp/gkp_stem_${id}_inst.wav`   },
  ];

  // ── Stage 1: ONE ffmpeg call → 5 band-split stems ───────────────────────
  // filter_complex splits the input 5 ways, applies each band filter, and
  // writes 5 separate output files. This replaces 5 separate ffmpeg calls.
  const vocalFilter  = isStereo
    ? "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=180,lowpass=f=5000"
    : "highpass=f=180,lowpass=f=5000";
  const instrFilter  = isStereo ? "pan=stereo|c0=c0-c1|c1=c1-c0" : "aecho=0.8:0.88:6:0.4";
  const drumsCh      = String(channels);
  const bassCh       = String(channels);
  const otherCh      = String(channels);
  const vocalCh      = "1";
  const instrCh      = isStereo ? "2" : String(channels);

  // Build filter_complex: asplit=5 → named branches → each filter applied
  const filterComplex = [
    `asplit=5[sv][sd][sb][so][si]`,
    `[sv]${vocalFilter}[vocals]`,
    `[sd]highpass=f=200,lowpass=f=2500[drums]`,
    `[sb]lowpass=f=250[bass]`,
    `[so]highpass=f=2500[other]`,
    `[si]${instrFilter}[instrumental]`,
  ].join(";");

  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", filePath,
      "-filter_complex", filterComplex,
      "-map", "[vocals]",       "-ac", vocalCh, "-acodec", "pcm_s16le", stemDefs[0].outPath,
      "-map", "[drums]",        "-ac", drumsCh, "-acodec", "pcm_s16le", stemDefs[1].outPath,
      "-map", "[bass]",         "-ac", bassCh,  "-acodec", "pcm_s16le", stemDefs[2].outPath,
      "-map", "[other]",        "-ac", otherCh, "-acodec", "pcm_s16le", stemDefs[3].outPath,
      "-map", "[instrumental]", "-ac", instrCh, "-acodec", "pcm_s16le", stemDefs[4].outPath,
    ], { maxBuffer: 200 * 1024 * 1024, timeout: 300_000 });

    // ── Stage 2: MLK v3 carving — SEQUENTIAL (never more than 1 ffmpeg at once) ─
    const zipInput: Record<string, Uint8Array> = {};
    let kernelParity = "MLK_V3_VALIDATED";
    const stemNames: string[] = [];

    for (const stem of stemDefs) {
      const rawBuf = await readFile(stem.outPath);
      await unlink(stem.outPath).catch(() => {});
      const { buf, parity } = await applyMLKv3Fast(rawBuf, multiplier);
      if (parity !== "MLK_V3_VALIDATED") kernelParity = parity;
      zipInput[`GKP_${stem.name}.wav`] = new Uint8Array(buf);
      stemNames.push(stem.name);
    }

    return {
      zipBuffer:    Buffer.from(zipSync(zipInput)),
      protocol:     MLK_PROTOCOL,
      model:        MLK_KERNEL,
      stems:        stemNames,
      kernelParity,
      stack:        MLK_STACK,
    };
  } finally {
    // Clean up any temp files that didn't get cleaned up in the loop
    for (const stem of stemDefs) {
      await unlink(stem.outPath).catch(() => {});
    }
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
