/**
 * Integration coverage for the approved export policy:
 * Pro: 10 WAV / rolling 7 days; King: 40 WAV / rolling 30 days; MP3 is
 * unlimited on both. Developer and Node Auditor are unlimited supersets.
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink, readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import app from "../app";
import { PRO_EXPORT_LIMIT, KING_EXPORT_LIMIT } from "../lib/exportQuota";
import { db, usersTable, sessionsTable } from "@workspace/db";

const execFileAsync = promisify(execFile);
const seeded: Array<{ id: string; sid: string }> = [];
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name} ${detail}`); console.error(`  ✗ ${name} ${detail}`); }
};

async function wav(): Promise<Buffer> {
  const path = `/tmp/gk_quota_${randomUUID()}.wav`;
  await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", "-acodec", "pcm_s16le", path]);
  const out = await readFile(path);
  await unlink(path).catch(() => {});
  return out;
}

async function user(tier: "pro" | "king" | "node_auditor", developer = false) {
  const id = `quota-${randomUUID()}`;
  const sid = randomBytes(24).toString("hex");
  await db.insert(usersTable).values({ id, email: `${id}@example.test`, subscriptionTier: tier, isDeveloper: developer });
  await db.insert(sessionsTable).values({
    sid, sess: { user: { id, subscriptionTier: tier }, access_token: "test" },
    expire: new Date(Date.now() + 60_000),
  });
  seeded.push({ id, sid });
  return { Authorization: `Bearer ${sid}` };
}

function convert(base: string, auth: Record<string, string>, bytes: Buffer, format: "wav" | "mp3") {
  const body = new FormData();
  body.append("format", format);
  body.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/wav" }), "input.wav");
  return fetch(`${base}/api/convert`, { method: "POST", headers: auth, body });
}

async function main() {
  const server = http.createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const bytes = await wav();

    const pro = await user("pro");
    const proWav = await Promise.all(Array.from({ length: PRO_EXPORT_LIMIT + 2 }, () => convert(base, pro, bytes, "wav")));
    check("Pro allows exactly 10 WAV exports", proWav.filter((r) => r.status === 200).length === PRO_EXPORT_LIMIT);
    check("Pro rejects WAV overflow with 429", proWav.filter((r) => r.status === 429).length === 2);
    const proMp3 = await Promise.all(Array.from({ length: 3 }, () => convert(base, pro, bytes, "mp3")));
    check("Pro MP3 exports remain unlimited after WAV cap", proMp3.every((r) => r.status === 200));

    const king = await user("king");
    const kingWav = await Promise.all(Array.from({ length: KING_EXPORT_LIMIT + 2 }, () => convert(base, king, bytes, "wav")));
    check("King allows exactly 40 WAV exports", kingWav.filter((r) => r.status === 200).length === KING_EXPORT_LIMIT);
    check("King rejects WAV overflow with 429", kingWav.filter((r) => r.status === 429).length === 2);
    const kingMp3 = await Promise.all(Array.from({ length: 3 }, () => convert(base, king, bytes, "mp3")));
    check("King MP3 exports are unlimited", kingMp3.every((r) => r.status === 200));

    for (const [label, auth] of [["developer", await user("pro", true)], ["node auditor", await user("node_auditor")]] as const) {
      const responses = await Promise.all(Array.from({ length: KING_EXPORT_LIMIT + 2 }, () => convert(base, auth, bytes, "wav")));
      check(`${label} bypasses WAV quota`, responses.every((r) => r.status === 200));
    }
  } finally {
    for (const u of seeded) {
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, u.sid)).catch(() => {});
      await db.delete(usersTable).where(eq(usersTable.id, u.id)).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}
main().catch((err) => { console.error(err); process.exitCode = 1; });