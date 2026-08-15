/**
 * Integration test: Task-94 generation-pipeline surfaces.
 *
 *   1. buildCoverArgs → deterministic ffmpeg args that actually render a
 *      600×600 cover PNG with the title baked in.
 *   2. POST /api/lyrics/verify → input validation + honest "ai_screening"
 *      labeling (verdict itself may fail open when Vertex is unreachable).
 *   3. GET /api/library → owner sees lyricsText; audioFullKey NEVER leaks.
 *   4. GET /api/tracks (public) → no lyricsText, no audioFullKey.
 *   5. GET /api/tracks/:id/stream → 401 unauthenticated, 403 non-owner,
 *      200 + audio for the owner, and the rolling export quota is NOT
 *      consumed (playback is not an export).
 *   6. Copyright-gate enforcement: flagged lyrics (primed deterministically
 *      into the guard cache) are rejected with 422 lyrics_flagged on BOTH
 *      project creation and revision, and NEITHER persists any lyric state —
 *      a clean project's content must survive a flagged revision attempt.
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink, readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";

import app from "../app";
import { buildCoverArgs } from "../services/mlkOrchestrator";
import { primeLyricVerificationForTest } from "../services/lyricGuard";
import { saveObjectWithFallback } from "../lib/objectStorage";
import {
  db,
  usersTable,
  sessionsTable,
  tracksTable,
  purchasedTracksTable,
  lyricProjectsTable,
  lyricRevisionsTable,
} from "@workspace/db";

const execFileAsync = promisify(execFile);

// ── Tiny assertion harness (matches the other tests in this suite) ───────────
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

async function makeTinyWav(seconds = 1): Promise<Buffer> {
  const out = `/tmp/gk_pipe_test_${randomUUID()}.wav`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-ac", "2", "-acodec", "pcm_s16le", "-ar", "22050", out,
  ], { timeout: 30_000 });
  const buf = await readFile(out);
  await unlink(out).catch(() => {});
  return buf;
}

async function seedUserWithSession(tier: "monthly" | "free"): Promise<{ userId: string; sid: string }> {
  const userId = `test-pipeline-${randomUUID()}`;
  const sid = randomBytes(32).toString("hex");
  await db.insert(usersTable).values({
    id: userId,
    email: `${userId}@example.test`,
    subscriptionTier: tier,
  });
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: { id: userId, subscriptionTier: tier },
      access_token: "test-access-token",
    },
    expire: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  return { userId, sid };
}

async function main(): Promise<void> {
  const appServer = http.createServer(app);
  const owner = await seedUserWithSession("monthly");
  const stranger = await seedUserWithSession("free");

  const trackId = randomUUID();
  const audioKey = `tracks/${trackId}/full.wav`;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
  const lyrics = "[Verse 1]\nGravel in my voice, thunder in the pines\nOriginal test lyrics, nothing borrowed here";

  try {
    // ── 1. Cover generation helper ─────────────────────────────────────────
    console.log("\n[1] buildCoverArgs renders a real 600×600 PNG");
    {
      const argsA = buildCoverArgs(trackId, "Test Track: One", "/tmp/a.png");
      const argsB = buildCoverArgs(trackId, "Test Track: One", "/tmp/a.png");
      check("cover args are deterministic for the same track id", JSON.stringify(argsA) === JSON.stringify(argsB));

      const otherArgs = buildCoverArgs(randomUUID(), "Test Track: One", "/tmp/b.png");
      // Gradient colors are seeded from the id — two ids virtually never collide.
      check(
        "different track ids produce different gradients",
        JSON.stringify(argsA.find((a) => a.includes("gradients"))) !==
          JSON.stringify(otherArgs.find((a) => a.includes("gradients"))),
      );

      const coverPath = `/tmp/gk_cover_test_${randomUUID()}.png`;
      await execFileAsync("ffmpeg", buildCoverArgs(trackId, "Pipeline Test Cover", coverPath), { timeout: 30_000 });
      const { stdout } = await execFileAsync(
        "ffprobe",
        ["-v", "quiet", "-print_format", "json", "-show_streams", coverPath],
        { timeout: 15_000 },
      );
      const info = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
      const v = info.streams?.[0];
      check("rendered cover is 600×600", v?.width === 600 && v?.height === 600, JSON.stringify(v));
      await unlink(coverPath).catch(() => {});
    }

    // ── Seed an owned generated track with real audio in storage ───────────
    const wav = await makeTinyWav(1);
    await saveObjectWithFallback(bucketId, audioKey, wav, { contentType: "audio/wav" });
    await db.insert(tracksTable).values({
      id: trackId,
      title: "Pipeline Test Track",
      artistName: "GravelKing Artist",
      audioFullKey: audioKey,
      audioPreviewKey: audioKey,
      coverArtKey: `tracks/${trackId}/cover.png`,
      price: 0,
      status: "accepted",
      lyricsText: lyrics,
    });
    await db.insert(purchasedTracksTable).values({
      userId: owner.userId,
      trackId,
    });

    // ── Start server ────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
    const ownerAuth = { Authorization: `Bearer ${owner.sid}` };
    const strangerAuth = { Authorization: `Bearer ${stranger.sid}` };

    // ── 2. /api/lyrics/verify contract ──────────────────────────────────────
    console.log("\n[2] POST /api/lyrics/verify");
    {
      const short = await fetch(`${base}/api/lyrics/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ownerAuth },
        body: JSON.stringify({ text: "hi" }),
      });
      check("too-short text → HTTP 400", short.status === 400, `got ${short.status}`);

      const res = await fetch(`${base}/api/lyrics/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ownerAuth },
        body: JSON.stringify({ text: lyrics }),
      });
      check("original lyrics → HTTP 200", res.status === 200, `got ${res.status}`);
      const data = (await res.json()) as { verdict?: string; method?: string };
      check(
        "verdict is clear or flagged (never silent)",
        data.verdict === "clear" || data.verdict === "flagged",
        JSON.stringify(data),
      );
      check("response is honestly labeled ai_screening", data.method === "ai_screening", JSON.stringify(data));
    }

    // ── 3. /api/library exposure rules ──────────────────────────────────────
    console.log("\n[3] GET /api/library — owner-only lyrics, no audioFullKey");
    {
      const res = await fetch(`${base}/api/library`, { headers: ownerAuth });
      check("owner library → HTTP 200", res.status === 200, `got ${res.status}`);
      const data = (await res.json()) as { tracks?: Array<Record<string, unknown>> };
      const t = data.tracks?.find((r) => r.id === trackId);
      check("owned track is listed", !!t);
      check("lyricsText is exposed to the owner", t?.lyricsText === lyrics);
      check("audioFullKey does NOT leak in /api/library", t !== undefined && !("audioFullKey" in t));
    }

    // ── 4. Public /api/tracks never leaks lyrics or full key ────────────────
    console.log("\n[4] GET /api/tracks — public listing stays scrubbed");
    {
      const res = await fetch(`${base}/api/tracks`);
      const data = (await res.json()) as { tracks?: Array<Record<string, unknown>> };
      const t = data.tracks?.find((r) => r.id === trackId);
      check("track appears in the public listing", !!t);
      check("no lyricsText on public listing", t !== undefined && !("lyricsText" in t));
      check("no audioFullKey on public listing", t !== undefined && !("audioFullKey" in t));
    }

    // ── 6. Copyright gate blocks flagged saves AND revisions ────────────────
    console.log("\n[6] lyric copyright gate — create + revise enforcement");
    {
      const cleanDraft = "[Verse 1]\nDust on the dashboard, miles on my mind\nEvery original word here is mine";
      const editedClean = "[Verse 1]\nDust on the dashboard, gravel in my chest\nRewrote these lines myself, no borrowed rest";
      const flaggedText = "[Chorus]\nTEST-FLAGGED lyric body — primed as a recognizable commercial song for this test run only";

      // Deterministic verdicts: prime the guard cache so no live Vertex call
      // decides the outcome of an enforcement test.
      primeLyricVerificationForTest(flaggedText, {
        verdict: "flagged",
        matchedWork: "Test Song — Test Artist",
        reason: "These lyrics appear to reproduce \"Test Song — Test Artist\".",
      });
      primeLyricVerificationForTest(cleanDraft, { verdict: "clear" });
      primeLyricVerificationForTest(editedClean, { verdict: "clear" });

      const gkCookie = `gk_session=test-gate-${randomUUID()}`;
      const jsonHeaders = { "Content-Type": "application/json", Cookie: gkCookie };

      // 6a. Flagged content on CREATE → 422, nothing persisted.
      const flaggedCreate = await fetch(`${base}/api/lyrics/project`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ aiDraft: cleanDraft, content: flaggedText, title: "Gate Test" }),
      });
      check("flagged create → HTTP 422", flaggedCreate.status === 422, `got ${flaggedCreate.status}`);
      const flaggedCreateBody = (await flaggedCreate.json()) as { code?: string; matchedWork?: string };
      check("flagged create carries code lyrics_flagged", flaggedCreateBody.code === "lyrics_flagged", JSON.stringify(flaggedCreateBody));
      check("flagged create names the matched work", flaggedCreateBody.matchedWork === "Test Song — Test Artist");
      const orphans = await db
        .select({ id: lyricProjectsTable.id })
        .from(lyricProjectsTable)
        .where(eq(lyricProjectsTable.currentContent, flaggedText));
      check("flagged create persisted NO project", orphans.length === 0, `${orphans.length} rows`);

      // Also: a flagged AI draft itself is rejected even with clean content.
      const flaggedDraft = await fetch(`${base}/api/lyrics/project`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ aiDraft: flaggedText, content: editedClean, title: "Gate Test 2" }),
      });
      check("flagged aiDraft → HTTP 422 even with clean content", flaggedDraft.status === 422, `got ${flaggedDraft.status}`);

      // 6b. Clean create stores the EDITED content as canonical, not the draft.
      const cleanCreate = await fetch(`${base}/api/lyrics/project`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ aiDraft: cleanDraft, content: editedClean, title: "Gate Test Clean" }),
      });
      check("clean create → HTTP 200", cleanCreate.status === 200, `got ${cleanCreate.status}`);
      const { id: gateProjectId } = (await cleanCreate.json()) as { id: string };
      const [savedProject] = await db
        .select()
        .from(lyricProjectsTable)
        .where(eq(lyricProjectsTable.id, gateProjectId));
      check("saved currentContent is the edited text (not aiDraft)", savedProject?.currentContent === editedClean);
      check("edited save is not marked AI-only", savedProject?.isAiOnly === false);
      check(
        "initial authorship score reflects the human edit",
        typeof savedProject?.authorshipScore === "number" && savedProject.authorshipScore > 0 && savedProject.authorshipScore <= 100,
        String(savedProject?.authorshipScore),
      );

      // 6c. Flagged REVISE → 422, and the clean saved content survives untouched.
      const flaggedRevise = await fetch(`${base}/api/lyrics/revise`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ projectId: gateProjectId, content: flaggedText, editType: "manual_edit" }),
      });
      check("flagged revise → HTTP 422", flaggedRevise.status === 422, `got ${flaggedRevise.status}`);
      const flaggedReviseBody = (await flaggedRevise.json()) as { code?: string };
      check("flagged revise carries code lyrics_flagged", flaggedReviseBody.code === "lyrics_flagged", JSON.stringify(flaggedReviseBody));

      const [afterRevise] = await db
        .select()
        .from(lyricProjectsTable)
        .where(eq(lyricProjectsTable.id, gateProjectId));
      check("project content unchanged after flagged revise", afterRevise?.currentContent === editedClean);
      const badRevisions = await db
        .select({ id: lyricRevisionsTable.id })
        .from(lyricRevisionsTable)
        .where(eq(lyricRevisionsTable.projectId, gateProjectId));
      check("no revision row persisted for the flagged attempt", badRevisions.length === 0, `${badRevisions.length} rows`);

      // 6d. A clean revise still works (the gate blocks, it doesn't brick).
      const cleanRevise = await fetch(`${base}/api/lyrics/revise`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ projectId: gateProjectId, content: cleanDraft, editType: "manual_edit" }),
      });
      check("clean revise → HTTP 200", cleanRevise.status === 200, `got ${cleanRevise.status}`);
      const [afterCleanRevise] = await db
        .select()
        .from(lyricProjectsTable)
        .where(eq(lyricProjectsTable.id, gateProjectId));
      check("clean revise persisted", afterCleanRevise?.currentContent === cleanDraft);

      // Cleanup gate-test rows (revisions first — FK).
      await db.delete(lyricRevisionsTable).where(eq(lyricRevisionsTable.projectId, gateProjectId)).catch(() => {});
      await db.delete(lyricProjectsTable).where(eq(lyricProjectsTable.id, gateProjectId)).catch(() => {});
    }

    // ── 5. /api/tracks/:id/stream ownership + quota behavior ────────────────
    console.log("\n[5] GET /api/tracks/:id/stream");
    {
      const anon = await fetch(`${base}/api/tracks/${trackId}/stream`);
      check("unauthenticated → HTTP 401", anon.status === 401, `got ${anon.status}`);

      const other = await fetch(`${base}/api/tracks/${trackId}/stream`, { headers: strangerAuth });
      check("non-owner → HTTP 403", other.status === 403, `got ${other.status}`);

      const [before] = await db.select().from(usersTable).where(eq(usersTable.id, owner.userId));

      const res = await fetch(`${base}/api/tracks/${trackId}/stream`, { headers: ownerAuth });
      check("owner → HTTP 200", res.status === 200, `got ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      check("audio content-type", ct.startsWith("audio/"), ct);
      const disposition = res.headers.get("content-disposition");
      check("served inline (no attachment header)", !disposition || !disposition.includes("attachment"), String(disposition));
      const body = Buffer.from(await res.arrayBuffer());
      check("audio bytes round-trip", body.length === wav.length, `${body.length} vs ${wav.length}`);

      const [after] = await db.select().from(usersTable).where(eq(usersTable.id, owner.userId));
      check(
        "streaming does NOT consume the export quota",
        before!.monthlyExports === after!.monthlyExports,
        `${before!.monthlyExports} → ${after!.monthlyExports}`,
      );
    }
  } finally {
    // ── Cleanup (FK-safe order) ───────────────────────────────────────────────
    await db.delete(purchasedTracksTable).where(eq(purchasedTracksTable.trackId, trackId)).catch(() => {});
    await db.delete(tracksTable).where(eq(tracksTable.id, trackId)).catch(() => {});
    for (const u of [owner, stranger]) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, u.sid)).catch(() => {});
      await db.delete(usersTable).where(eq(usersTable.id, u.userId)).catch(() => {});
    }
    appServer.close();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nGENERATION PIPELINE FAILURES:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

void main();
