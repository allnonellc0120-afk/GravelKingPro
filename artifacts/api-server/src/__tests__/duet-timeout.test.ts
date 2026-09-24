/**
 * Duet handshake regression coverage:
 * - a room that has been idle for 15 minutes becomes a tombstone and returns
 *   the exact expired-room response instead of silently creating a new room;
 * - both clients retain the strict watchdog and manual cleanup contract.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

import app from "../app";

const ROOM_IDLE_TIMEOUT_MS = 15 * 60_000;
const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.basename(testDir) === "dist-test"
  ? path.resolve(testDir, "../..")
  : path.resolve(testDir, "../../..");

async function main(): Promise<void> {
  const roomId = `duet-expiry-${randomUUID()}`;
  const server = http.createServer(app);
  const originalNow = Date.now;

  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const join = () => fetch(`${base}/api/duet/room/${encodeURIComponent(roomId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: "expiry-test-peer" }),
    });

    const first = await join();
    assert.equal(first.status, 200);

    Date.now = () => originalNow() + ROOM_IDLE_TIMEOUT_MS + 1;
    const expired = await fetch(`${base}/api/duet/room/${encodeURIComponent(roomId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: "new-peer-after-expiry" }),
    });
    assert.equal(expired.status, 410);
    assert.deepEqual(await expired.json(), {
      code: "ROOM_EXPIRED",
      error: "This room session has expired. Start a new session.",
    });
  } finally {
    Date.now = originalNow;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const duetClient = readFileSync(path.join(projectRoot, "gravelkingpro/src/pages/duet.tsx"), "utf8");
  const stageClient = readFileSync(path.join(projectRoot, "gravelkingpro/src/pages/main-stage.tsx"), "utf8");
  for (const source of [duetClient, stageClient]) {
    assert.match(source, /DUET_HANDSHAKE_TIMEOUT_MS = 45_000/);
    assert.match(source, /Partner did not respond or network blocked the handshake\./);
    assert.match(source, /This room session has expired\. Start a new session\./);
    assert.match(source, /pending(?:IceCandidates|Candidates)Ref\.current = \[\]/);
    assert.match(source, /(?:streamRef|sseRef)\.current\?\.close\(\)/);
    assert.match(source, /(?:pcRef|dataChannelRef)\.current\?\.close\(\)/);
    assert.match(source, /Cancel(?: \/|\/) Back to Solo/);
  }

  console.log("duet expiry and handshake timeout regressions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});