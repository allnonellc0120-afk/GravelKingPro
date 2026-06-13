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
import { mlk_v3, bufferToFloat32, float32ToBuffer } from "./kernel-v3";

const execFileAsync = promisify(execFile);

// Wrapper script that patches torchaudio.load/save to use ffmpeg (bypasses missing torchcodec).
// Resolves relative to the compiled bundle: dist/ -> .. -> artifacts/api-server/
const _here = dirname(fileURLToPath(import.meta.url));
const DEMUCS_RUNNER = resolve(_here, "..", "gkp_demucs_runner.py");

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

/**
 * Apply MLK v3 kernel to a pcm_s16le WAV buffer.
 * Preserves the WAV header, processes only the PCM payload.
 */
interface WavFormat {
  numChannels:   number;
  sampleRate:    number;
  bitsPerSample: number;
  dataOffset:    number;
  dataSize:      number;
}

/**
 * Parse a RIFF/WAVE buffer by walking its chunks. ffmpeg-written WAVs are not
 * guaranteed to have a fixed 44-byte header — they may carry a LIST/INFO
 * metadata chunk before (or after) the `data` chunk — so we must locate the
 * `fmt ` and `data` chunks explicitly rather than assuming offsets.
 */
function parseWav(buf: Buffer): WavFormat {
  if (
    buf.length < 12 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Invalid WAV: missing RIFF/WAVE header");
  }
  let offset = 12;
  let fmt: Omit<WavFormat, "dataOffset" | "dataSize"> | null = null;
  while (offset + 8 <= buf.length) {
    const chunkId   = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const body      = offset + 8;
    if (chunkId === "fmt ") {
      fmt = {
        numChannels:   buf.readUInt16LE(body + 2),
        sampleRate:    buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (chunkId === "data") {
      if (!fmt) throw new Error("Invalid WAV: data chunk before fmt chunk");
      return { ...fmt, dataOffset: body, dataSize: Math.min(chunkSize, buf.length - body) };
    }
    // RIFF chunks are word-aligned (padded to an even byte count).
    offset = body + chunkSize + (chunkSize % 2);
  }
  throw new Error("Invalid WAV: no data chunk found");
}

/** Build a canonical 44-byte PCM WAV header for the given format + data size. */
function buildWavHeader(
  numChannels:   number,
  sampleRate:    number,
  bitsPerSample: number,
  dataSize:      number,
): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate   = sampleRate * blockAlign;
  const header     = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);             // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20);              // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return header;
}

function applyMLKv3(wavBuf: Buffer, multiplier: number): { buf: Buffer; parity: string } {
  const { numChannels, sampleRate, bitsPerSample, dataOffset, dataSize } = parseWav(wavBuf);
  const pcm = wavBuf.subarray(dataOffset, dataOffset + dataSize);

  const samples  = bufferToFloat32(pcm);
  const { processed, stats } = mlk_v3(samples, multiplier, 2);
  const outPcm   = float32ToBuffer(processed);

  const header = buildWavHeader(numChannels, sampleRate, bitsPerSample, outPcm.length);
  return { buf: Buffer.concat([header, outPcm]), parity: stats.parity };
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

/** Run an ffmpeg audio filter on a buffer and return a pcm_s16le WAV. */
async function ffmpegFilterToWav(
  inputBuf: Buffer,
  ext: string,
  filter: string,
  channels: number,
): Promise<Buffer> {
  const id      = randomUUID();
  const inPath  = `/tmp/mlk_in_${id}.${ext}`;
  const outPath = `/tmp/mlk_out_${id}.wav`;
  await writeFile(inPath, inputBuf);
  try {
    const args = ["-y", "-i", inPath];
    if (filter) args.push("-af", filter);
    args.push("-ac", String(channels), "-acodec", "pcm_s16le", outPath);
    await execFileAsync("ffmpeg", args, { maxBuffer: 200 * 1024 * 1024, timeout: 120_000 });
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

/**
 * MLK v3 Voice Removal — center-channel cancellation + MLK v3 kernel.
 * Stereo: cancels center-panned vocals (out = L−R). Mono: attenuates the vocal
 * presence band. Output is post-processed through the Morris Law Kernel v3.
 */
export async function mlkVocalRemoval(
  inputBuf:   Buffer,
  ext:        string,
  channels:   number,
  multiplier: number = 0.75,
): Promise<GNSVocalResult> {
  const filter = channels >= 2
    ? "pan=stereo|c0=c0-c1|c1=c1-c0"
    : "equalizer=f=2500:t=q:w=2:g=-9";
  const rawBuf          = await ffmpegFilterToWav(inputBuf, ext, filter, channels >= 2 ? 2 : 1);
  const { buf, parity } = applyMLKv3(rawBuf, multiplier);
  return {
    instrumental: buf,
    kernelParity: parity,
    protocol:     MLK_PROTOCOL,
    model:        MLK_KERNEL,
    stack:        MLK_STACK,
  };
}

/**
 * MLK v3 Stem Split — frequency-band + spatial separation, each band carved by
 * the Morris Law Kernel v3. Produces the 5 stems the studio UI expects
 * (vocals, drums, bass, other, instrumental).
 */
export async function mlkStemSplit(
  inputBuf:   Buffer,
  ext:        string,
  channels:   number,
  multiplier: number = 0.75,
): Promise<GNSResult> {
  const isStereo = channels >= 2;
  const specs: Array<{ name: string; filter: string; ch: number }> = [
    { name: "vocals", filter: isStereo
        ? "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=180,lowpass=f=5000"
        : "highpass=f=180,lowpass=f=5000", ch: 1 },
    { name: "drums",  filter: "highpass=f=200,lowpass=f=2500", ch: channels },
    { name: "bass",   filter: "lowpass=f=250",                 ch: channels },
    { name: "other",  filter: "highpass=f=2500",               ch: channels },
    { name: "instrumental", filter: isStereo ? "pan=stereo|c0=c0-c1|c1=c1-c0" : "", ch: isStereo ? 2 : channels },
  ];

  const zipInput: Record<string, Uint8Array> = {};
  let kernelParity = "MLK_V3_VALIDATED";
  const stemNames: string[] = [];

  await Promise.all(
    specs.map(async (s) => {
      const rawBuf          = await ffmpegFilterToWav(inputBuf, ext, s.filter, s.ch);
      const { buf, parity } = applyMLKv3(rawBuf, multiplier);
      if (parity !== "MLK_V3_VALIDATED") kernelParity = parity;
      zipInput[`GKP_${s.name}.wav`] = new Uint8Array(buf);
      stemNames.push(s.name);
    }),
  );

  return {
    zipBuffer:    Buffer.from(zipSync(zipInput)),
    protocol:     MLK_PROTOCOL,
    model:        MLK_KERNEL,
    stems:        stemNames,
    kernelParity,
    stack:        MLK_STACK,
  };
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
