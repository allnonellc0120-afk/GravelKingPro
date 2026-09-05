/**
 * Clerk JIT provisioning / account-linking check.
 *
 * The Clerk migration replaced the legacy OIDC `upsertUser` with
 * `jitProvisionUser` (middlewares/authMiddleware.ts). This suite guards the
 * reconciliation contract against the real dev database:
 *
 *   1. Bridge-id row reuse — a migrated user whose users.id equals the Clerk
 *      sessionClaims.userId keeps their row, tier, and developer flag.
 *   2. Email-row ADOPTION — rows created by email-only grant-access (UUID id,
 *      UNIQUE email) must be adopted, not shadowed or crashed into: the signed-in
 *      user gets the existing row (same id, entitlement intact), and no second
 *      row is created.
 *   3. Case-insensitive email adoption.
 *   4. Fresh insert for brand-new users, and idempotency across repeat calls.
 *   5. Concurrent first authenticated requests — exactly one row, both callers
 *      resolve to it.
 *   6. Lifetime grants refresh on the ADOPTED row id (not the bridge id).
 *   7. Lifetime-granted emails refresh to the top tier.
 */
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { __jitProvisionUserForTest as jitProvisionUser } from "../middlewares/authMiddleware";

// ── Tiny assertion harness (matches the other tests in this suite) ───────────
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const run = randomUUID().slice(0, 8);
const createdIds: string[] = [];

async function countByEmail(email: string): Promise<number> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email.toLowerCase()}`);
  return rows.length;
}

async function main() {
  // ── 1. Bridge-id row reuse (migrated / legacy-ID user) ─────────────────────
  console.log("\n[1] Bridge-id row reuse keeps entitlement");
  {
    const bridgeId = `test-bridge-${run}`;
    const email = `bridge-${run}@example.com`;
    createdIds.push(bridgeId);
    await db.insert(usersTable).values({
      id: bridgeId,
      email,
      isPro: true,
      subscriptionTier: "monthly",
    });

    const user = await jitProvisionUser(bridgeId, email);
    check("resolves the existing row", user?.id === bridgeId, `got ${user?.id}`);
    check("keeps isPro", user?.isPro === true);
    check("keeps tier", user?.subscriptionTier === "monthly", `got ${user?.subscriptionTier}`);
    check("no duplicate row for email", (await countByEmail(email)) === 1);
  }

  // ── 2. Email-row adoption (grant-access UUID row) ──────────────────────────
  console.log("\n[2] Email-only grant row is ADOPTED, not duplicated");
  {
    const legacyId = randomUUID(); // grant-access rows use gen_random_uuid()
    const bridgeId = `test-clerk-${run}-adopt`;
    const email = `grantee-${run}@example.com`;
    createdIds.push(legacyId, bridgeId);
    await db.insert(usersTable).values({
      id: legacyId,
      email,
      isPro: true,
      subscriptionTier: "node_auditor",
    });

    const user = await jitProvisionUser(bridgeId, email);
    check("adopts the legacy row id", user?.id === legacyId, `got ${user?.id}`);
    check("paid tier survives sign-in", user?.subscriptionTier === "node_auditor", `got ${user?.subscriptionTier}`);
    check("isPro survives sign-in", user?.isPro === true);
    check("exactly one row for the email", (await countByEmail(email)) === 1);
    const [bridgeRow] = await db.select().from(usersTable).where(eq(usersTable.id, bridgeId));
    check("no shadow row under the bridge id", bridgeRow === undefined);
  }

  // ── 3. Case-insensitive email adoption ─────────────────────────────────────
  console.log("\n[3] Email adoption is case-insensitive");
  {
    const legacyId = randomUUID();
    const bridgeId = `test-clerk-${run}-case`;
    const email = `Case-${run}@Example.com`;
    createdIds.push(legacyId, bridgeId);
    await db.insert(usersTable).values({ id: legacyId, email, isPro: true, subscriptionTier: "weekly" });

    const user = await jitProvisionUser(bridgeId, email.toLowerCase());
    check("adopts despite case mismatch", user?.id === legacyId, `got ${user?.id}`);
    check("tier survives", user?.subscriptionTier === "weekly", `got ${user?.subscriptionTier}`);
  }

  // ── 4. Fresh insert + idempotency ──────────────────────────────────────────
  console.log("\n[4] Brand-new user inserts once, repeat calls are idempotent");
  {
    const bridgeId = `test-clerk-${run}-new`;
    const email = `new-${run}@example.com`;
    createdIds.push(bridgeId);

    const first = await jitProvisionUser(bridgeId, email);
    check("insert keyed by bridge id", first?.id === bridgeId, `got ${first?.id}`);
    check("defaults to free", first?.isPro !== true && !first?.subscriptionTier);

    const second = await jitProvisionUser(bridgeId, email);
    check("second call resolves same row", second?.id === bridgeId);
    check("still exactly one row", (await countByEmail(email)) === 1);
  }

  // ── 5. Concurrent first authenticated requests ─────────────────────────────
  console.log("\n[5] Concurrent first requests create exactly one row");
  {
    const bridgeId = `test-clerk-${run}-race`;
    const email = `race-${run}@example.com`;
    createdIds.push(bridgeId);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => jitProvisionUser(bridgeId, email)),
    );
    check("all callers resolve a row", results.every((r) => r !== null));
    check("all callers agree on the id", new Set(results.map((r) => r?.id)).size === 1,
      `ids: ${[...new Set(results.map((r) => r?.id))].join(", ")}`);
    check("exactly one row exists", (await countByEmail(email)) === 1);
  }

  // ── 6. Concurrent requests against a pre-existing email row ───────────────
  console.log("\n[6] Concurrent requests adopt the same pre-existing email row");
  {
    const legacyId = randomUUID();
    const bridgeId = `test-clerk-${run}-race2`;
    const email = `race2-${run}@example.com`;
    createdIds.push(legacyId, bridgeId);
    await db.insert(usersTable).values({ id: legacyId, email, isPro: true, subscriptionTier: "monthly" });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => jitProvisionUser(bridgeId, email)),
    );
    check("all adopt the legacy row", results.every((r) => r?.id === legacyId),
      `ids: ${[...new Set(results.map((r) => r?.id))].join(", ")}`);
    check("entitlement intact on all", results.every((r) => r?.isPro === true && r?.subscriptionTier === "monthly"));
    check("still exactly one row", (await countByEmail(email)) === 1);
  }

  // ── 7. Lifetime-granted email provisions at the top tier ───────────────────
  console.log("\n[7] Lifetime-granted email receives permanent top-tier access");
  {
    const bridgeId = `test-clerk-${run}-lifetime`;
    createdIds.push(bridgeId);
    const user = await jitProvisionUser(bridgeId, "hopelaborde66@gmail.com");
    check("provisions the account", user !== null);
    check("receives node_auditor tier", user?.subscriptionTier === "node_auditor");
    check("is marked pro", user?.isPro === true);
    const [row] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = 'hopelaborde66@gmail.com'`);
    check("persisted row keeps node_auditor tier", row?.subscriptionTier === "node_auditor");
  }
  {
    const bridgeId = `test-clerk-${run}-nina`;
    createdIds.push(bridgeId);
    const user = await jitProvisionUser(bridgeId, "Ninastar1226@gmail.com");
    check("Nina's account provisions", user !== null);
    check("Nina's account receives node_auditor tier", user?.subscriptionTier === "node_auditor");
    check("Nina's account is marked pro", user?.isPro === true);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  await db.delete(usersTable).where(inArray(usersTable.id, createdIds));
  await db.delete(usersTable).where(sql`${usersTable.email} LIKE ${"%-" + run + "@example.com"}`);

  console.log(`\nClerk JIT provisioning check: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  try {
    await db.delete(usersTable).where(inArray(usersTable.id, createdIds));
  } catch { /* best effort */ }
  console.error(err);
  process.exit(1);
});
