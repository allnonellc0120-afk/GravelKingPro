/**
 * Unit test: track purchase identity resolution.
 *
 * Regression guard for the embedded Payment Element checkout: a signed-in
 * buyer (req.dbUser set by Clerk/OIDC or a server session) must own the
 * purchase — not a fresh anonymous gk_session row — or the track never shows
 * up in their library. /library resolves identity the same way (dbUser first).
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Request } from "express";

import { resolveTrackBuyer } from "../routes/tracks";
import { db, usersTable } from "@workspace/db";

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

function fakeReq(opts: { dbUser?: unknown; gkSession?: string }): Request {
  return {
    dbUser: opts.dbUser,
    cookies: opts.gkSession ? { gk_session: opts.gkSession } : {},
  } as unknown as Request;
}

async function main(): Promise<void> {
  const signedInId = `tb_test_signed_${randomUUID()}`;
  await db.insert(usersTable).values({ id: signedInId }).onConflictDoNothing();

  try {
    // 1. Signed-in buyer: dbUser wins over the anonymous session row.
    const signedReq = fakeReq({ dbUser: { id: signedInId }, gkSession: randomUUID() });
    const signed = await resolveTrackBuyer(signedReq);
    check(
      "signed-in buyer: purchase user is the dbUser, not the gk_session row",
      signed.buyer.id === signedInId,
      `got buyer=${signed.buyer.id}, session=${signed.sessionUser.id}`,
    );
    check(
      "signed-in buyer: session row still minted (cookie attribution preserved)",
      typeof signed.sessionUser.id === "string" && signed.sessionUser.id.length > 0,
    );

    // 2. Anonymous buyer: falls back to the gk_session user.
    const anonReq = fakeReq({ gkSession: randomUUID() });
    const anon = await resolveTrackBuyer(anonReq);
    check(
      "anonymous buyer: falls back to the gk_session user",
      anon.buyer.id === anon.sessionUser.id,
      `buyer=${anon.buyer.id} session=${anon.sessionUser.id}`,
    );

    // 3. Anonymous with no cookie at all: a session user is minted.
    const bareReq = fakeReq({});
    const bare = await resolveTrackBuyer(bareReq);
    check(
      "no cookie: a session user is minted for attribution",
      bare.buyer.id === bare.sessionUser.id && bare.buyer.id.length > 0,
    );

    // Cleanup minted session users.
    await db.execute(sql`DELETE FROM users WHERE id IN (${signed.sessionUser.id}, ${anon.sessionUser.id}, ${bare.sessionUser.id})`);
  } finally {
    await db.execute(sql`DELETE FROM users WHERE id = ${signedInId}`);
  }

  console.log(`\nResults: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
