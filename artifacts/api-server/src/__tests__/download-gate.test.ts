/**
 * Download-gate unit tests: the three layers that stop expired orders from
 * being downloaded after the 7-day window.
 *
 *   1. HMAC download_token (issueDownloadToken/verifyDownloadToken):
 *      round-trip, expiry, signature tampering, malformed tokens,
 *      wrong-session tokens.
 *   2. 7-day delivery window (deliveryExpired): inside/outside the window,
 *      and fail-closed for missing/unparseable delivered_at.
 *
 * A regression in any layer silently re-opens permanent downloads, so these
 * must stay green under `pnpm --filter @workspace/api-server run test`.
 */
import { createHmac } from "node:crypto";

import {
  issueDownloadToken,
  verifyDownloadToken,
  deliveryExpired,
  DOWNLOAD_TOKEN_TTL_MS,
  DOWNLOAD_WINDOW_MS,
} from "../lib/downloadGate";

// The gate derives its HMAC key from SESSION_SECRET; the test only needs SOME
// secret present, never the real one.
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "download-gate-test-secret";
}

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

function signFor(sessionId: string, exp: number): string {
  return createHmac("sha256", process.env.SESSION_SECRET as string)
    .update(`weekend-master:${sessionId}:${exp}`)
    .digest("hex");
}

function main(): void {
  const sessionId = "cs_test_download_gate_1";

  // ── 1. Token round-trip ────────────────────────────────────────────────────
  console.log("\ndownload_token: round-trip");
  const token = issueDownloadToken(sessionId);
  check("freshly issued token verifies for its session", verifyDownloadToken(sessionId, token));
  check(
    "token issued for one session is rejected for another",
    !verifyDownloadToken("cs_test_other_session", token),
  );
  check(
    "token embeds an expiry ~TTL in the future",
    (() => {
      const exp = Number(token.split(".")[0]);
      const delta = exp - Date.now();
      return delta > DOWNLOAD_TOKEN_TTL_MS - 60_000 && delta <= DOWNLOAD_TOKEN_TTL_MS;
    })(),
  );

  // ── 2. Token expiry ────────────────────────────────────────────────────────
  console.log("\ndownload_token: expiry");
  const pastExp = Date.now() - 1_000;
  const expiredToken = `${pastExp}.${signFor(sessionId, pastExp)}`;
  check("correctly signed but expired token is rejected", !verifyDownloadToken(sessionId, expiredToken));

  const farPastExp = Date.now() - DOWNLOAD_TOKEN_TTL_MS * 10;
  const longExpiredToken = `${farPastExp}.${signFor(sessionId, farPastExp)}`;
  check("long-expired token is rejected", !verifyDownloadToken(sessionId, longExpiredToken));

  // ── 3. Signature tampering ─────────────────────────────────────────────────
  console.log("\ndownload_token: tampering");
  const [expRaw, sig] = token.split(".");
  const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
  check("token with flipped signature byte is rejected", !verifyDownloadToken(sessionId, `${expRaw}.${flipped}`));

  const extendedExp = Number(expRaw) + DOWNLOAD_WINDOW_MS;
  check(
    "extending exp without re-signing is rejected",
    !verifyDownloadToken(sessionId, `${extendedExp}.${sig}`),
  );
  check(
    "attacker-signed token with wrong secret is rejected",
    !verifyDownloadToken(
      sessionId,
      `${extendedExp}.${createHmac("sha256", "wrong-secret").update(`weekend-master:${sessionId}:${extendedExp}`).digest("hex")}`,
    ),
  );

  console.log("\ndownload_token: malformed input");
  check("empty token is rejected", !verifyDownloadToken(sessionId, ""));
  check("token without separator is rejected", !verifyDownloadToken(sessionId, sig));
  check("token with non-numeric exp is rejected", !verifyDownloadToken(sessionId, `soon.${sig}`));
  check("token with missing signature is rejected", !verifyDownloadToken(sessionId, `${expRaw}.`));
  check("token with truncated signature is rejected", !verifyDownloadToken(sessionId, `${expRaw}.${sig.slice(0, 10)}`));

  // ── 4. 7-day delivery window ───────────────────────────────────────────────
  console.log("\ndeliveryExpired: 7-day window");
  const now = Date.now();
  check(
    "just-delivered order is NOT expired",
    !deliveryExpired({ delivered_at: new Date(now).toISOString() }),
  );
  check(
    "order delivered 6 days ago is NOT expired",
    !deliveryExpired({ delivered_at: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString() }),
  );
  check(
    "order delivered 7 days + 1 minute ago IS expired",
    deliveryExpired({ delivered_at: new Date(now - DOWNLOAD_WINDOW_MS - 60_000).toISOString() }),
  );
  check(
    "order delivered 30 days ago IS expired",
    deliveryExpired({ delivered_at: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString() }),
  );

  console.log("\ndeliveryExpired: fail-closed");
  check("missing delivered_at IS expired (fail closed)", deliveryExpired({}));
  check("null delivered_at IS expired (fail closed)", deliveryExpired({ delivered_at: null }));
  check("empty delivered_at IS expired (fail closed)", deliveryExpired({ delivered_at: "" }));
  check(
    "unparseable delivered_at IS expired (fail closed)",
    deliveryExpired({ delivered_at: "not-a-date" }),
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nDOWNLOAD GATE FAILURES (expired orders may be downloadable):");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

main();
