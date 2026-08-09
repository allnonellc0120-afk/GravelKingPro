/**
 * Integration test: /api/kernel/master survives the sidechain + auto-threshold
 * parameter surface with a real WAV upload.
 *
 * Runs the real Express `app` in-process (partner API key auth → unlimited,
 * no usage/email gates) and asserts:
 *   - every sidechain_filter value (none / highpass / lowpass) → 200 + valid WAV
 *   - both auto_threshold=true and auto_threshold=false paths
 *   - adaptive_mode off/bass_aware combined with the sidechain values
 *   - malformed values (sidechainFreq=NaN, intensity=-1) → 400, never 500
 *
 * MLK_KERNEL_URL is cleared so the LOCAL Python worker path (the code under
 * test) runs deterministically — no dependency on the Cloud Run service.
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, symlink, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

// Force the local Python worker BEFORE the app/route modules load.
delete process.env.MLK_KERNEL_URL;

import app from "../app";
import { partnerApiKey } from "../routes/master";
import { isValidWav } from "../kernel-v3";

const execFileAsync = promisify(execFile);

// ── Tiny assertion harness ────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function makeTrueStereoWav(seconds = 2): Promise<Buffer> {
  // Distinct L (440 Hz) / R (523 Hz) so the channels never cancel to silence.
  const out = `/tmp/gk_mtest_stereo_${randomUUID()}.wav`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=523:duration=${seconds}`,
    "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]",
    "-map", "[a]", "-acodec", "pcm_s16le", "-ar", "44100", out,
  ], { timeout: 30_000 });
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(out);
  await unlink(out).catch(() => {});
  return buf;
}

async function assertDecodableWav(label: string, buf: Buffer): Promise<void> {
  check(`${label}: well-formed RIFF/WAV`, isValidWav(buf), `${buf.length} bytes`);
  const tmp = `/tmp/gk_mtest_decode_${randomUUID()}.wav`;
  await writeFile(tmp, buf);
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", tmp],
      { timeout: 15_000 },
    );
    const info = JSON.parse(stdout);
    const stream = info.streams?.find((s: { codec_type?: string }) => s.codec_type === "audio");
    const duration = parseFloat(info.format?.duration ?? "0");
    check(`${label}: ffprobe decodes audio stream`, !!stream && duration > 0, `duration=${duration}`);
  } catch (err) {
    check(`${label}: ffprobe decodes audio stream`, false, String(err));
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function buildForm(fields: Record<string, string>, wav: Buffer): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "in.wav");
  return fd;
}

/**
 * The bundled route resolves the Python worker relative to its own module
 * (`../python/mlk_master.py`). The test bundle lives in dist-test/, so that
 * resolves to the real package-root python/ directory. Verify it up front so
 * a broken resolution fails loudly instead of as a 500 on every request.
 */
async function ensurePythonWorkerPath(): Promise<void> {
  const workerPath = fileURLToPath(new URL("../python/mlk_master.py", import.meta.url));
  try {
    await stat(workerPath);
  } catch {
    // Fallback (e.g. bundle nested one level deeper): symlink ../python next
    // to the bundle so the route's relative resolution still works.
    const linkPath = fileURLToPath(new URL("../python", import.meta.url));
    await symlink("../python", linkPath, "dir").catch(() => {});
    await stat(workerPath);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await ensurePythonWorkerPath();

  const apiKey = partnerApiKey();
  if (!apiKey) throw new Error("SESSION_SECRET missing — cannot derive partner API key");
  const auth = { "x-api-key": apiKey };

  const appServer = http.createServer(app);
  try {
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
    const stereoWav = await makeTrueStereoWav(2);

    // ── 1. Success matrix: sidechain_filter × adaptive_mode × auto_threshold ──
    // Covers all three sidechain_filter values, both adaptive modes, and both
    // auto-threshold paths across three real kernel runs.
    const matrix: Array<{
      label: string;
      sidechainFilter: "none" | "highpass" | "lowpass";
      adaptiveMode: "off" | "bass_aware";
      autoThreshold: boolean;
    }> = [
      { label: "highpass + bass_aware + auto_threshold=true",  sidechainFilter: "highpass", adaptiveMode: "bass_aware", autoThreshold: true  },
      { label: "lowpass + off + auto_threshold=false",         sidechainFilter: "lowpass",  adaptiveMode: "off",        autoThreshold: false },
      { label: "none + bass_aware + auto_threshold=true",      sidechainFilter: "none",     adaptiveMode: "bass_aware", autoThreshold: true  },
    ];

    for (const [i, c] of matrix.entries()) {
      console.log(`\n[${i + 1}] POST /api/kernel/master — ${c.label}`);
      const res = await fetch(`${base}/api/kernel/master`, {
        method: "POST",
        headers: auth,
        body: buildForm({
          preset: "baseline",
          intensity: "75",
          sidechainFilter: c.sidechainFilter,
          sidechainFreq: "160",
          stereoLink: "true",
          adaptiveMode: c.adaptiveMode,
          autoThreshold: c.autoThreshold ? "true" : "false",
          autoThresholdOffset: "-16",
        }, stereoWav),
      });
      check(`${c.label}: HTTP 200`, res.status === 200, `got ${res.status} ${await (res.status === 200 ? Promise.resolve("") : res.text().then(t => t.slice(0, 200)))}`);
      if (res.status !== 200) continue;
      check(`${c.label}: X-GK-Kernel = MLK_v3.5`, res.headers.get("x-gk-kernel") === "MLK_v3.5", String(res.headers.get("x-gk-kernel")));
      check(`${c.label}: X-GK-Sidechain echoes`, res.headers.get("x-gk-sidechain") === c.sidechainFilter, String(res.headers.get("x-gk-sidechain")));
      check(`${c.label}: X-GK-AdaptiveMode echoes`, res.headers.get("x-gk-adaptivemode") === c.adaptiveMode, String(res.headers.get("x-gk-adaptivemode")));
      check(`${c.label}: X-GK-AutoThreshold echoes`, res.headers.get("x-gk-autothreshold") === String(c.autoThreshold), String(res.headers.get("x-gk-autothreshold")));
      if (c.autoThreshold) {
        // The kernel measured a real RMS and applied a derived threshold.
        const rms = parseFloat(res.headers.get("x-gk-detectedrmsdb") ?? "");
        const thr = parseFloat(res.headers.get("x-gk-appliedthresholddb") ?? "");
        check(`${c.label}: auto-threshold RMS measured`, Number.isFinite(rms) && rms < 0, `detectedRmsDb=${rms}`);
        check(`${c.label}: applied threshold derived`, Number.isFinite(thr) && thr < rms, `appliedThresholdDb=${thr}`);
      } else {
        check(`${c.label}: no RMS headers when auto off`, res.headers.get("x-gk-detectedrmsdb") === null, String(res.headers.get("x-gk-detectedrmsdb")));
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await assertDecodableWav(c.label, buf);
    }

    // ── 2. Malformed values → 400, never 500 ──────────────────────────────────
    console.log("\n[4] Malformed values → 400");
    {
      const res = await fetch(`${base}/api/kernel/master`, {
        method: "POST",
        headers: auth,
        body: buildForm({ preset: "baseline", sidechainFreq: "NaN" }, stereoWav),
      });
      check("sidechainFreq=NaN: HTTP 400", res.status === 400, `got ${res.status}`);
    }
    {
      const res = await fetch(`${base}/api/kernel/master`, {
        method: "POST",
        headers: auth,
        body: buildForm({ preset: "baseline", intensity: "-1" }, stereoWav),
      });
      check("intensity=-1: HTTP 400", res.status === 400, `got ${res.status}`);
    }
    {
      // Repeated multipart fields arrive as arrays — must be 400, never a
      // TypeError-driven 500.
      const fd = buildForm({ preset: "baseline" }, stereoWav);
      fd.append("intensity", "50");
      fd.append("intensity", "60");
      const res = await fetch(`${base}/api/kernel/master`, { method: "POST", headers: auth, body: fd });
      check("duplicate intensity fields: HTTP 400", res.status === 400, `got ${res.status}`);
    }
    {
      const fd = buildForm({ preset: "baseline" }, stereoWav);
      fd.append("sidechainFreq", "160");
      fd.append("sidechainFreq", "200");
      const res = await fetch(`${base}/api/kernel/master`, { method: "POST", headers: auth, body: fd });
      check("duplicate sidechainFreq fields: HTTP 400", res.status === 400, `got ${res.status}`);
    }
    {
      // Duplicate non-numeric string fields must degrade to defaults, not 500.
      const fd = buildForm({ preset: "baseline" }, stereoWav);
      fd.append("artist", "A");
      fd.append("artist", "B");
      fd.append("intensity", "not-a-number");
      const res = await fetch(`${base}/api/kernel/master`, { method: "POST", headers: auth, body: fd });
      check("duplicate artist + bad intensity: HTTP 400 (never 500)", res.status === 400, `got ${res.status}`);
    }
    {
      // No file at all — sanity guard on the earliest 400 branch.
      const fd = new FormData();
      fd.append("preset", "baseline");
      const res = await fetch(`${base}/api/kernel/master`, { method: "POST", headers: auth, body: fd });
      check("no audio file: HTTP 400", res.status === 400, `got ${res.status}`);
    }
  } finally {
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n──────────────────────────────────────────`);
  console.log(`Mastering kernel sidechain/auto-threshold check: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Test harness crashed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { pool } = await import("@workspace/db");
      await pool.end();
    } catch { /* ignore */ }
  });
