/**
 * Integration test: paid Studio audio always returns valid MLK v3 audio.
 *
 * Runs the real Express `app` in-process against a seeded monthly (Studio) session
 * and asserts the revenue-gated surface:
 *   - POST /api/kernel/process-audio (mode=standard) → 200, X-GK-Kernel: MLK_v3, decodable WAV
 *   - POST /api/kernel/studio-mix                     → 200, X-GK-Kernel: MLK_v3, decodable WAV
 *   - studio-mix combined-duration guard             → HTTP 422
 *   - both endpoints with no session                 → 403 STUDIO_REQUIRED
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import app from "../app";
import { isValidWav } from "../kernel-v3";
import { db, usersTable, sessionsTable, processRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
  const out = `/tmp/gk_test_stereo_${randomUUID()}.wav`;
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

async function makeLongMp3(seconds: number): Promise<Buffer> {
  const out = `/tmp/gk_test_long_${randomUUID()}.mp3`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-ac", "2", "-acodec", "libmp3lame", "-b:a", "32k", out,
  ], { timeout: 60_000 });
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(out);
  await unlink(out).catch(() => {});
  return buf;
}

async function assertDecodableWav(label: string, buf: Buffer): Promise<void> {
  check(`${label}: well-formed RIFF/WAV`, isValidWav(buf), `${buf.length} bytes`);
  const tmp = `/tmp/gk_test_decode_${randomUUID()}.wav`;
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

function buildForm(fields: Record<string, string>, files: Array<{ field: string; name: string; type: string; buf: Buffer }>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) {
    fd.append(f.field, new Blob([new Uint8Array(f.buf)], { type: f.type }), f.name);
  }
  return fd;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const userId = `test-studio-${randomUUID()}`;
  const sid = randomBytes(32).toString("hex");

  const appServer = http.createServer(app);

  try {
    // ── Seed a monthly (Studio) session via the OIDC bearer path ───────────────
    await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.test`,
      subscriptionTier: "monthly",
    });
    await db.insert(sessionsTable).values({
      sid,
      sess: {
        user: { id: userId, subscriptionTier: "monthly" },
        access_token: "test-access-token",
      },
      expire: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // ── Start server ────────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const apiPort = (appServer.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${apiPort}`;
    const auth = { Authorization: `Bearer ${sid}` };

    // Fixtures
    const stereoWav = await makeTrueStereoWav(2);
    const longMp3 = await makeLongMp3(300);

    // ── 1. process-audio mode=standard (local MLK v3) ──────────────────────────
    console.log("\n[1] POST /api/kernel/process-audio mode=standard (authed Studio)");
    {
      const res = await fetch(`${base}/api/kernel/process-audio`, {
        method: "POST",
        headers: auth,
        body: buildForm({ mode: "standard" }, [
          { field: "audio", name: "in.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });
      check("standard: HTTP 200", res.status === 200, `got ${res.status}`);
      check("standard: X-GK-Kernel = MLK_v3", res.headers.get("x-gk-kernel") === "MLK_v3", String(res.headers.get("x-gk-kernel")));
      const buf = Buffer.from(await res.arrayBuffer());
      await assertDecodableWav("standard", buf);
    }

    // ── 2. studio-mix ──────────────────────────────────────────────────────────
    console.log("\n[2] POST /api/kernel/studio-mix (authed Studio)");
    {
      const res = await fetch(`${base}/api/kernel/studio-mix`, {
        method: "POST",
        headers: auth,
        body: buildForm({ arrangement: "sequential", speed: "1" }, [
          { field: "tracks", name: "t1.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });
      check("studio-mix: HTTP 200", res.status === 200, `got ${res.status}`);
      check("studio-mix: X-GK-Kernel = MLK_v3", res.headers.get("x-gk-kernel") === "MLK_v3", String(res.headers.get("x-gk-kernel")));
      const buf = Buffer.from(await res.arrayBuffer());
      await assertDecodableWav("studio-mix", buf);
    }

    // ── 3. studio-mix combined-duration guard → 422 ────────────────────────────
    console.log("\n[3] POST /api/kernel/studio-mix combined-duration guard");
    {
      const res = await fetch(`${base}/api/kernel/studio-mix`, {
        method: "POST",
        headers: auth,
        body: buildForm({ arrangement: "sequential", speed: "0.25" }, [
          { field: "tracks", name: "long.mp3", type: "audio/mpeg", buf: longMp3 },
        ]),
      });
      check("combined-duration guard: HTTP 422", res.status === 422, `got ${res.status}`);
    }

    // ── 4. 403 STUDIO_REQUIRED with no session ─────────────────────────────────
    console.log("\n[4] No session → 403 STUDIO_REQUIRED on both endpoints");
    {
      const res = await fetch(`${base}/api/kernel/process-audio`, {
        method: "POST",
        body: buildForm({ mode: "standard" }, [
          { field: "audio", name: "in.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });
      check("process-audio (no session): HTTP 403", res.status === 403, `got ${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      check("process-audio (no session): code STUDIO_REQUIRED", body?.code === "STUDIO_REQUIRED", JSON.stringify(body));
    }
    {
      const res = await fetch(`${base}/api/kernel/studio-mix`, {
        method: "POST",
        body: buildForm({}, [
          { field: "tracks", name: "t1.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });
      check("studio-mix (no session): HTTP 403", res.status === 403, `got ${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      check("studio-mix (no session): code STUDIO_REQUIRED", body?.code === "STUDIO_REQUIRED", JSON.stringify(body));
    }

    // ── 5. Transcription endpoint stable behaviour ──────────────────────────────
    // The endpoint must NOT use Replicate Whisper as a fallback. It either returns
    // 200 (Gemini available + succeeds) or 502 with fallback:"tap-timing" (not
    // configured or provider error). It must never return 500.
    console.log("\n[5] POST /api/audio/transcribe — stable behaviour (no Replicate)");
    {
      // 5a. No file → 400
      const noFile = await fetch(`${base}/api/audio/transcribe`, { method: "POST" });
      check("transcribe (no file): HTTP 400", noFile.status === 400, `got ${noFile.status}`);
    }
    {
      // 5b. Valid audio → 200 (Gemini) or 502 (tap-timing), never 500
      const res = await fetch(`${base}/api/audio/transcribe`, {
        method: "POST",
        body: buildForm({}, [
          { field: "audio", name: "vocal.wav", type: "audio/wav", buf: stereoWav },
        ]),
      });
      const isOk = res.status === 200 || res.status === 502;
      check("transcribe (valid audio): 200 or 502, never 500", isOk, `got ${res.status}`);
      if (res.status === 200) {
        const body = (await res.json().catch(() => ({}))) as { segments?: unknown[]; fullText?: string };
        check("transcribe 200: has segments array", Array.isArray(body.segments), JSON.stringify(body));
      } else if (res.status === 502) {
        const body = (await res.json().catch(() => ({}))) as { fallback?: string; error?: string };
        check("transcribe 502: fallback=tap-timing", body.fallback === "tap-timing", JSON.stringify(body));
        // Must not mention Replicate in the user-facing error
        const noReplicate = !String(body.error ?? "").toLowerCase().includes("replicate");
        check("transcribe 502: error does not mention Replicate", noReplicate, body.error ?? "");
      }
    }
  } finally {
    // ── Cleanup: children (process_runs) → sessions → users ────────────────────
    await db.delete(processRunsTable).where(eq(processRunsTable.userId, userId)).catch(() => {});
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n──────────────────────────────────────────`);
  console.log(`Studio audio MLK v3 check: ${passed} passed, ${failures.length} failed`);
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
