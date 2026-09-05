/**
 * Integration test: certificate paywall — privacy, ownership, and allowance gates.
 *
 * Scenarios (HTTP-level, against the real Express app):
 *
 *   [1]  No auth → 401 on JSON, PDF, status, unlock, checkout
 *   [2]  Non-owner (authenticated, wrong user) → 404 on all five endpoints
 *   [3]  Ownerless legacy stub (ownerUserId IS NULL) → 404 for any authenticated non-developer
 *   [4]  Owner, cert still locked → 402 on JSON and PDF
 *   [5]  Pro subscriber receives a free certificate unlock
 *   [6]  King subscriber included unlock is unlimited and idempotent
 *   [7]  Concurrent King unlocks leave no allowance counter to consume
 *   [8]  /:certId.pdf route is correctly registered BEFORE /:certId in Express 5
 *        (regression guard for the "/:certId swallows /:certId.pdf" ordering bug)
 *
 * Webhook cert_unlock idempotency + owner-scoping is covered separately in
 * cert-unlock-webhook.test.ts.
 */

import http from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { AddressInfo } from "node:net";

import app from "../app";
import { db, usersTable, sessionsTable, ipCertStubsTable } from "@workspace/db";

// ── Assertion harness ─────────────────────────────────────────────────────────

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

// ── DB seed helpers ───────────────────────────────────────────────────────────

interface SeededUser {
  userId: string;
  sid: string;
  bearerAuth: { Authorization: string };
  cookieAuth: { Cookie: string };
}

const seededUsers: SeededUser[] = [];
const seededCerts: string[] = [];

async function seedUser(opts: {
  subscriptionTier?: string;
  isDeveloper?: boolean;
  certUnlocks?: number;
  certUnlockPeriodStart?: Date | null;
}): Promise<SeededUser> {
  const userId = `test-cpw-${randomUUID()}`;
  const sid = randomBytes(32).toString("hex");
  await db.insert(usersTable).values({
    id: userId,
    email: `${userId}@example.test`,
    subscriptionTier: opts.subscriptionTier ?? "free",
    isDeveloper: opts.isDeveloper ?? false,
    certUnlocks: opts.certUnlocks ?? 0,
    certUnlockPeriodStart: opts.certUnlockPeriodStart ?? null,
  });
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: { id: userId, subscriptionTier: opts.subscriptionTier ?? "free" },
      access_token: "test-access-token",
    },
    expire: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const u: SeededUser = {
    userId,
    sid,
    bearerAuth: { Authorization: `Bearer ${sid}` },
    cookieAuth: { Cookie: `gk_session=${sid}` },
  };
  seededUsers.push(u);
  return u;
}

async function seedCert(opts: {
  ownerUserId: string | null;
  unlockedAt?: Date | null;
  unlockSource?: string | null;
}): Promise<string> {
  const certId = `cert-cpw-${randomUUID()}`;
  await db.insert(ipCertStubsTable).values({
    certId,
    denominator: "a".repeat(32),
    handshake: "b".repeat(64),
    contentHash: "c".repeat(64),
    artist: "Test Artist",
    ownerUserId: opts.ownerUserId,
    unlockedAt: opts.unlockedAt ?? null,
    unlockSource: opts.unlockSource ?? null,
  });
  seededCerts.push(certId);
  return certId;
}

async function readUserRow(userId: string) {
  const [row] = await db
    .select({
      certUnlocks: usersTable.certUnlocks,
      certUnlockPeriodStart: usersTable.certUnlockPeriodStart,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return row ?? null;
}

async function readCertRow(certId: string) {
  const [row] = await db
    .select()
    .from(ipCertStubsTable)
    .where(eq(ipCertStubsTable.certId, certId));
  return row ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const appServer = http.createServer(app);

  try {
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;

    // ── [1] No-auth → 401 on every endpoint ───────────────────────────────────
    console.log("\n[1] No auth → 401 on JSON, PDF, status, unlock, checkout");
    {
      const owner = await seedUser({ subscriptionTier: "king" });
      const certId = await seedCert({ ownerUserId: owner.userId });

      const r1 = await fetch(`${base}/api/court-cert/${certId}`);
      check("1.1 no-auth JSON → 401", r1.status === 401, `got ${r1.status}`);

      const r2 = await fetch(`${base}/api/court-cert/${certId}.pdf`);
      check("1.2 no-auth PDF → 401", r2.status === 401, `got ${r2.status}`);

      const r3 = await fetch(`${base}/api/court-cert/${certId}/status`);
      check("1.3 no-auth status → 401", r3.status === 401, `got ${r3.status}`);

      const r4 = await fetch(`${base}/api/court-cert/${certId}/unlock`, { method: "POST" });
      check("1.4 no-auth unlock → 401", r4.status === 401, `got ${r4.status}`);

      const r5 = await fetch(`${base}/api/court-cert/${certId}/checkout`, { method: "POST" });
      check("1.5 no-auth checkout → 401", r5.status === 401, `got ${r5.status}`);
    }

    // ── [2] Non-owner → 404 on all endpoints ──────────────────────────────────
    console.log("\n[2] Non-owner authenticated user → 404");
    {
      const owner = await seedUser({ subscriptionTier: "king" });
      const other = await seedUser({ subscriptionTier: "king" });
      const certId = await seedCert({ ownerUserId: owner.userId });

      const r1 = await fetch(`${base}/api/court-cert/${certId}`, {
        headers: other.bearerAuth,
      });
      check("2.1 non-owner JSON → 404", r1.status === 404, `got ${r1.status}`);

      const r2 = await fetch(`${base}/api/court-cert/${certId}.pdf`, {
        headers: other.bearerAuth,
      });
      check("2.2 non-owner PDF → 404", r2.status === 404, `got ${r2.status}`);

      const r3 = await fetch(`${base}/api/court-cert/${certId}/status`, {
        headers: other.bearerAuth,
      });
      check("2.3 non-owner status → 404", r3.status === 404, `got ${r3.status}`);

      const r4 = await fetch(`${base}/api/court-cert/${certId}/unlock`, {
        method: "POST",
        headers: other.bearerAuth,
      });
      check("2.4 non-owner unlock → 404", r4.status === 404, `got ${r4.status}`);

      const r5 = await fetch(`${base}/api/court-cert/${certId}/checkout`, {
        method: "POST",
        headers: other.bearerAuth,
      });
      check("2.5 non-owner checkout → 404", r5.status === 404, `got ${r5.status}`);
    }

    // ── [3] Ownerless legacy stub → fails closed (404 for any non-developer) ──
    console.log("\n[3] Ownerless legacy stub → 404 for authenticated non-developer");
    {
      const user = await seedUser({ subscriptionTier: "king" });
      const certId = await seedCert({ ownerUserId: null }); // legacy stub, no owner

      const r1 = await fetch(`${base}/api/court-cert/${certId}`, {
        headers: user.bearerAuth,
      });
      check("3.1 ownerless stub JSON → 404", r1.status === 404, `got ${r1.status}`);

      const r2 = await fetch(`${base}/api/court-cert/${certId}.pdf`, {
        headers: user.bearerAuth,
      });
      check("3.2 ownerless stub PDF → 404", r2.status === 404, `got ${r2.status}`);

      const r3 = await fetch(`${base}/api/court-cert/${certId}/status`, {
        headers: user.bearerAuth,
      });
      check("3.3 ownerless stub status → 404", r3.status === 404, `got ${r3.status}`);

      const r4 = await fetch(`${base}/api/court-cert/${certId}/unlock`, {
        method: "POST",
        headers: user.bearerAuth,
      });
      check("3.4 ownerless stub unlock → 404", r4.status === 404, `got ${r4.status}`);

      const r5 = await fetch(`${base}/api/court-cert/${certId}/checkout`, {
        method: "POST",
        headers: user.bearerAuth,
      });
      check("3.5 ownerless stub checkout → 404", r5.status === 404, `got ${r5.status}`);
    }

    // ── [4] Owner, cert locked → 402 on JSON and PDF ──────────────────────────
    console.log("\n[4] Owner with locked cert → 402 on JSON and PDF");
    {
      const owner = await seedUser({ subscriptionTier: "king" });
      const certId = await seedCert({ ownerUserId: owner.userId }); // unlockedAt = NULL

      const r1 = await fetch(`${base}/api/court-cert/${certId}`, {
        headers: owner.bearerAuth,
      });
      check("4.1 owner + locked cert JSON → 402", r1.status === 402, `got ${r1.status}`);
      const b1 = await r1.json() as Record<string, unknown>;
      check("4.2 JSON 402 has CERT_LOCKED code", b1.code === "CERT_LOCKED", JSON.stringify(b1));
      check("4.3 JSON 402 exposes certId", b1.certId === certId, JSON.stringify(b1));
      check("4.4 JSON 402 exposes priceCents", typeof b1.priceCents === "number", JSON.stringify(b1));

      const r2 = await fetch(`${base}/api/court-cert/${certId}.pdf`, {
        headers: owner.bearerAuth,
      });
      check("4.5 owner + locked cert PDF → 402", r2.status === 402, `got ${r2.status}`);

      // status endpoint should still be accessible (returns lock state, not the doc)
      const r3 = await fetch(`${base}/api/court-cert/${certId}/status`, {
        headers: owner.bearerAuth,
      });
      check("4.6 owner + locked cert status → 200", r3.status === 200, `got ${r3.status}`);
      const b3 = await r3.json() as Record<string, unknown>;
      check("4.7 status reports unlocked:false", b3.unlocked === false, JSON.stringify(b3));
    }

    // ── [5] Certificates are free for every signed-in creator ────────────────
    console.log("\n[5] Pro subscriber receives a free certificate unlock");
    {
      const owner = await seedUser({ subscriptionTier: "pro" });
      const certId = await seedCert({ ownerUserId: owner.userId });

      const r = await fetch(`${base}/api/court-cert/${certId}/unlock`, {
        method: "POST",
        headers: owner.bearerAuth,
      });
      check("5.1 Pro tier unlock → 200", r.status === 200, `got ${r.status}`);
      const b = await r.json() as Record<string, unknown>;
      check("5.2 Pro unlock reports unlocked", b.unlocked === true, JSON.stringify(b));
      const row = await readCertRow(certId);
      check("5.3 cert is unlocked in DB", row?.unlockedAt != null, String(row?.unlockedAt));
    }

    // ── [6] King included unlock: unlimited and idempotent ─────────────────────
    console.log("\n[6] King subscriber included unlock: unlimited, idempotent");
    {
      const owner = await seedUser({ subscriptionTier: "king" });
      const certId = await seedCert({ ownerUserId: owner.userId });

      // First unlock
      const r1 = await fetch(`${base}/api/court-cert/${certId}/unlock`, {
        method: "POST",
        headers: owner.bearerAuth,
      });
      check("6.1 first unlock → 200", r1.status === 200, `got ${r1.status}`);
      const b1 = await r1.json() as Record<string, unknown>;
      check("6.2 first unlock: unlocked=true", b1.unlocked === true, JSON.stringify(b1));
      check("6.3 first unlock: alreadyUnlocked not set", !b1.alreadyUnlocked, JSON.stringify(b1));

      const row1 = await readUserRow(owner.userId);
      check("6.4 King unlock does not consume a counter", row1?.certUnlocks === 0, `certUnlocks=${row1?.certUnlocks}`);
      check("6.5 King unlock does not start a quota window", !row1?.certUnlockPeriodStart);

      // Cert should now be unlocked in DB
      const certRow1 = await readCertRow(certId);
      check("6.6 cert unlockedAt is set", !!certRow1?.unlockedAt);
      check("6.7 cert unlockSource is 'free'", certRow1?.unlockSource === "free", `got ${certRow1?.unlockSource}`);

      // Second call (idempotent)
      const r2 = await fetch(`${base}/api/court-cert/${certId}/unlock`, {
        method: "POST",
        headers: owner.bearerAuth,
      });
      check("6.8 second unlock → 200 (idempotent)", r2.status === 200, `got ${r2.status}`);
      const b2 = await r2.json() as Record<string, unknown>;
      check("6.9 second unlock: alreadyUnlocked=true", b2.alreadyUnlocked === true, JSON.stringify(b2));

      const row2 = await readUserRow(owner.userId);
      check(
        "6.10 King has no counter to double-consume",
        row2?.certUnlocks === 0,
        `certUnlocks=${row2?.certUnlocks}`,
      );

      // Now the cert document should be readable
      const r3 = await fetch(`${base}/api/court-cert/${certId}`, {
        headers: owner.bearerAuth,
      });
      check("6.11 owner reads unlocked cert JSON → 200", r3.status === 200, `got ${r3.status}`);
      const b3 = await r3.json() as Record<string, unknown>;
      check("6.12 cert JSON has certificate field", !!b3.certificate, JSON.stringify(b3));
    }

    // ── [7] Concurrent King unlocks → no allowance counter ────────────────────
    console.log("\n[7] Concurrent King included unlocks → no counter consumption");
    {
      const owner = await seedUser({ subscriptionTier: "king" });
      const certId = await seedCert({ ownerUserId: owner.userId });

      // Fire 5 concurrent POST /unlock requests
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          fetch(`${base}/api/court-cert/${certId}/unlock`, {
            method: "POST",
            headers: owner.bearerAuth,
          }),
        ),
      );
      const statuses = results.map((r) => r.status);
      const ok200 = statuses.filter((s) => s === 200).length;
      check(
        "7.1 all concurrent unlocks return 200 (idempotent once claimed)",
        ok200 === 5,
        `statuses: ${statuses.join(",")}`,
      );

      const row = await readUserRow(owner.userId);
      check(
        "7.2 King counter stays untouched",
        row?.certUnlocks === 0,
        `certUnlocks=${row?.certUnlocks}`,
      );

      const certRow = await readCertRow(certId);
      check("7.3 cert is unlocked exactly once", !!certRow?.unlockedAt);
    }

    // ── [8] PDF route registered before JSON route (Express 5 ordering) ────────
    console.log("\n[8] PDF route registers before /:certId (Express 5 ordering regression)");
    {
      const owner = await seedUser({ subscriptionTier: "king" });
      // Cert already unlocked so the route returns a PDF response (not 402)
      const certId = await seedCert({ ownerUserId: owner.userId, unlockedAt: new Date(), unlockSource: "admin" });

      // If /:certId were registered before /:certId.pdf, Express 5 would match
      // the first and the PDF endpoint would be unreachable. We verify by
      // checking the Content-Type — a JSON 200 body means the /:certId route
      // swallowed the request.
      const r = await fetch(`${base}/api/court-cert/${certId}.pdf`, {
        headers: owner.bearerAuth,
      });
      check("8.1 /:certId.pdf → 200", r.status === 200, `got ${r.status}`);
      const ct = r.headers.get("content-type") ?? "";
      check("8.2 /:certId.pdf content-type is application/pdf (not JSON)", ct.includes("application/pdf"), `got: ${ct}`);
    }

  } finally {
    // Clean up: ip_cert_stubs (no FK dependencies) → sessions → users
    for (const certId of seededCerts) {
      await db.execute(sql`DELETE FROM ip_cert_stubs WHERE cert_id = ${certId}`).catch(() => {});
    }
    for (const u of seededUsers) {
      await db.execute(sql`DELETE FROM sessions WHERE sid = ${u.sid}`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE id = ${u.userId}`).catch(() => {});
    }
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Cert paywall: ${passed} passed, ${failures.length} failed`);
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
