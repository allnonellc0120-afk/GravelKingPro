/**
 * Integration test: paid Studio audio always returns valid MLK v3 audio.
 *
 * Runs the real Express `app` in-process against a seeded monthly (Studio) session
 * and asserts the revenue-gated surface:
 *   - POST /api/kernel/process-audio (mode=standard) → 200, X-GK-Kernel: MLK_v3, decodable WAV
 *   - POST /api/kernel/studio-mix                     → 200, X-GK-Kernel: MLK_v3, decodable WAV
 *   - studio-mix combined-duration guard             → HTTP 422
 *   - both endpoints with no session                 → 403 STUDIO_REQUIRED
 *   - remote-branch contract (controllable mock)     → remote routing + MLK_v3 + decodable WAV
 *   - remote returns non-WAV "audio/*"               → falls back to local, still MLK_v3 + decodable
 *
 * The remote real kernel is offline in dev, so the remote branch is exercised against
 * an in-process mock by toggling REMOTE_KERNEL_URL at runtime (getRemoteUrl reads
 * process.env per request). Fixtures are true-stereo (distinct L/R) so center-cancel
 * style processing never collapses to digital silence and trips a false parity error.
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
  // Low-bitrate MP3 keeps the file tiny while ffprobe still reports the long
  // duration — enough to trip duration guards without a huge upload.
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
  // Take full control of remote routing in-process (real remote is offline in dev).
  const originalRemote = process.env.REMOTE_KERNEL_URL;
  delete process.env.REMOTE_KERNEL_URL;

  const userId = `test-studio-${randomUUID()}`;
  const sid = randomBytes(32).toString("hex");

  // Mock remote kernel — behavior switched via a mutable flag.
  let remoteMode: "valid" | "invalid" = "valid";
  let remoteWav: Buffer = Buffer.alloc(0);
  const mockRemote = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (remoteMode === "invalid") {
        res.writeHead(200, { "Content-Type": "audio/wav" });
        res.end(Buffer.from("this is definitely not a wav payload"));
        return;
      }
      res.writeHead(200, { "Content-Type": "audio/wav", "X-GK-Parity": "VALIDATED_REMOTE" });
      res.end(remoteWav);
    });
  });

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
        // no expires_at → middleware never attempts an OIDC refresh
      },
      expire: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // ── Start servers ──────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    await new Promise<void>((resolve) => mockRemote.listen(0, "127.0.0.1", resolve));
    const apiPort = (appServer.address() as AddressInfo).port;
    const mockPort = (mockRemote.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${apiPort}`;
    const mockUrl = `http://127.0.0.1:${mockPort}`;
    const auth = { Authorization: `Bearer ${sid}` };

    // Fixtures
    const stereoWav = await makeTrueStereoWav(2);
    remoteWav = await makeTrueStereoWav(2);
    const longMp3 = await makeLongMp3(300);

    // ── 1. process-audio mode=standard (local fallback) ────────────────────────
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
      // 300s track at 0.25x → ~1200s output > MAX_AUDIO_DURATION_S (900s).
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

    // ── 5. Remote-branch contract (controllable mock) ──────────────────────────
    console.log("\n[5] Remote branch contract (mock returns valid WAV)");
    {
      remoteMode = "valid";
      process.env.REMOTE_KERNEL_URL = mockUrl;
      try {
        const res = await fetch(`${base}/api/kernel/process-audio`, {
          method: "POST",
          headers: auth,
          body: buildForm({ mode: "standard" }, [
            { field: "audio", name: "in.wav", type: "audio/wav", buf: stereoWav },
          ]),
        });
        check("remote: HTTP 200", res.status === 200, `got ${res.status}`);
        check("remote: X-GK-Routing = remote", res.headers.get("x-gk-routing") === "remote", String(res.headers.get("x-gk-routing")));
        check("remote: X-GK-Kernel = MLK_v3", res.headers.get("x-gk-kernel") === "MLK_v3", String(res.headers.get("x-gk-kernel")));
        check("remote: X-GK-Parity propagated", res.headers.get("x-gk-parity") === "VALIDATED_REMOTE", String(res.headers.get("x-gk-parity")));
        const buf = Buffer.from(await res.arrayBuffer());
        await assertDecodableWav("remote", buf);
      } finally {
        delete process.env.REMOTE_KERNEL_URL;
      }
    }

    // ── 6. Remote returns non-WAV "audio/*" → local fallback ───────────────────
    console.log("\n[6] Remote returns non-WAV audio → falls back to local MLK_v3");
    {
      remoteMode = "invalid";
      process.env.REMOTE_KERNEL_URL = mockUrl;
      try {
        const res = await fetch(`${base}/api/kernel/process-audio`, {
          method: "POST",
          headers: auth,
          body: buildForm({ mode: "standard" }, [
            { field: "audio", name: "in.wav", type: "audio/wav", buf: stereoWav },
          ]),
        });
        check("remote-fallback: HTTP 200", res.status === 200, `got ${res.status}`);
        check("remote-fallback: routed local", res.headers.get("x-gk-routing") === "local", String(res.headers.get("x-gk-routing")));
        check("remote-fallback: X-GK-Kernel = MLK_v3", res.headers.get("x-gk-kernel") === "MLK_v3", String(res.headers.get("x-gk-kernel")));
        const buf = Buffer.from(await res.arrayBuffer());
        await assertDecodableWav("remote-fallback", buf);
      } finally {
        delete process.env.REMOTE_KERNEL_URL;
      }
    }
  } finally {
    // ── Cleanup: children (process_runs) → sessions → users ────────────────────
    await db.delete(processRunsTable).where(eq(processRunsTable.userId, userId)).catch(() => {});
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockRemote.close(() => resolve()));
    if (originalRemote !== undefined) process.env.REMOTE_KERNEL_URL = originalRemote;
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
    // Drizzle pool keeps the event loop alive; close it so the process exits.
    try {
      const { pool } = await import("@workspace/db");
      await pool.end();
    } catch { /* ignore */ }
  });
