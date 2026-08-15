/**
 * Integration test: lyric project ownership cannot be forged via gk_session.
 *
 * Legacy lyric_projects rows stored a user principal id in sessionId. User ids
 * are public/stable identifiers, not bearer secrets — a client-supplied
 * gk_session cookie equal to a known user id must NEVER grant access to that
 * legacy project. Only a server-authenticated session (Bearer sid → req.dbUser)
 * may own such a row. Normal rows (random session tokens) keep working with a
 * matching cookie.
 *
 * Asserts on GET/DELETE /api/lyrics/project/:id:
 *   [1] legacy row (sessionId = userId): forged cookie gk_session=<userId> → 403
 *   [2] legacy row: authenticated owner (Bearer sid) → 200 (GET and DELETE)
 *   [3] legacy row: no credential at all → 403
 *   [4] normal row (random token): matching gk_session cookie → 200
 *   [5] normal row: wrong cookie → 403
 */
import http from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import app from "../app";
import { db, usersTable, sessionsTable, lyricProjectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

async function seedProject(sessionId: string): Promise<string> {
  const id = `test-lyrproj-${randomUUID()}`;
  await db.insert(lyricProjectsTable).values({
    id,
    sessionId,
    title: "Owner-auth test project",
    aiDraft: "test draft",
    currentContent: "test content",
  });
  return id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const userId = `test-lyrowner-${randomUUID()}`;
  const sid = randomBytes(32).toString("hex");
  const projectIds: string[] = [];
  const appServer = http.createServer(app);

  try {
    // Authenticated owner: users row + sessions row (Bearer <sid> → req.dbUser)
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

    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;

    // ── [1–3] Legacy row: sessionId = user principal id ────────────────────────
    console.log("\n[1] Legacy row: forged gk_session=<userId> must be rejected");
    const legacyId = await seedProject(userId);
    projectIds.push(legacyId);
    {
      const res = await fetch(`${base}/api/lyrics/project/${legacyId}`, {
        headers: { Cookie: `gk_session=${userId}` },
      });
      check("legacy + forged cookie: GET → 403", res.status === 403, `got ${res.status}`);
      const del = await fetch(`${base}/api/lyrics/project/${legacyId}`, {
        method: "DELETE",
        headers: { Cookie: `gk_session=${userId}` },
      });
      check("legacy + forged cookie: DELETE → 403", del.status === 403, `got ${del.status}`);
    }

    console.log("\n[2] Legacy row: no credential at all → 403");
    {
      const res = await fetch(`${base}/api/lyrics/project/${legacyId}`);
      check("legacy + no credential: GET → 403", res.status === 403, `got ${res.status}`);
    }

    console.log("\n[3] Legacy row: authenticated owner succeeds");
    {
      const res = await fetch(`${base}/api/lyrics/project/${legacyId}`, {
        headers: { Authorization: `Bearer ${sid}` },
      });
      check("legacy + Bearer owner: GET → 200", res.status === 200, `got ${res.status}`);
      const del = await fetch(`${base}/api/lyrics/project/${legacyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sid}` },
      });
      check("legacy + Bearer owner: DELETE → 200", del.status === 200, `got ${del.status}`);
    }

    // ── [4–5] Normal row: random session token ────────────────────────────────
    console.log("\n[4] Normal row: matching random-token cookie still works");
    const token = randomUUID();
    const normalId = await seedProject(token);
    projectIds.push(normalId);
    {
      const res = await fetch(`${base}/api/lyrics/project/${normalId}`, {
        headers: { Cookie: `gk_session=${token}` },
      });
      check("normal + matching cookie: GET → 200", res.status === 200, `got ${res.status}`);
    }

    console.log("\n[5] Normal row: wrong cookie → 403");
    {
      const res = await fetch(`${base}/api/lyrics/project/${normalId}`, {
        headers: { Cookie: `gk_session=${randomUUID()}` },
      });
      check("normal + wrong cookie: GET → 403", res.status === 403, `got ${res.status}`);
    }
  } finally {
    for (const id of projectIds) {
      await db.delete(lyricProjectsTable).where(eq(lyricProjectsTable.id, id)).catch(() => {});
    }
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Lyric owner-auth check: ${passed} passed, ${failures.length} failed`);
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
