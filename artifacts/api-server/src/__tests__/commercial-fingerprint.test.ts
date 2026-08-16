import { createServer } from "node:http";
import { once } from "node:events";
import { writeFile, unlink } from "node:fs/promises";
import { scanCommercialFingerprint } from "../lib/commercialFingerprint";

let passed = 0;
let failed = 0;

function check(condition: unknown, label: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function makeWav(): Buffer {
  const sampleRate = 8000;
  const samples = sampleRate;
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function main(): Promise<void> {
  console.log("\n[Commercial fingerprint Cloud Run client]");
  const fixture = `/tmp/gkp_fingerprint_test_${process.pid}.wav`;
  await writeFile(fixture, makeWav());

  let mode: "no_match" | "match" | "unavailable" = "no_match";
  let apiKeySeen = false;
  const server = createServer((req, res) => {
    apiKeySeen = req.headers["x-api-key"] === "internal-test-key";
    req.resume();
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (mode === "unavailable") {
        res.statusCode = 503;
        res.end(JSON.stringify({
          status: "unavailable",
          code: "SCAN_TEMPORARILY_UNAVAILABLE",
          message: "Scan temporarily unavailable",
        }));
      } else if (mode === "match") {
        res.end(JSON.stringify({
          status: "match",
          provider: "acrcloud",
          matches: [{ title: "Known Song", artists: ["Known Artist"], isrc: "USABC1234567" }],
        }));
      } else {
        res.end(JSON.stringify({ status: "no_match", provider: "acrcloud", matches: [] }));
      }
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");

  process.env["FINGERPRINT_SERVICE_URL"] = `http://127.0.0.1:${address.port}`;
  process.env["FINGERPRINT_SERVICE_API_KEY"] = "internal-test-key";
  process.env["FINGERPRINT_CLOUD_RUN_IAM"] = "false";

  try {
    const clear = await scanCommercialFingerprint(fixture);
    check(clear.status === "no_match", "no-match response passes through");
    check(apiKeySeen, "internal service key is sent");

    mode = "match";
    const match = await scanCommercialFingerprint(fixture);
    check(match.status === "match", "catalog match passes through");
    check(match.status === "match" && match.matches[0]?.isrc === "USABC1234567", "match metadata is preserved");

    mode = "unavailable";
    const unavailable = await scanCommercialFingerprint(fixture);
    check(unavailable.status === "unavailable", "503 becomes unavailable instead of throwing");

    delete process.env["FINGERPRINT_SERVICE_URL"];
    const unconfigured = await scanCommercialFingerprint(fixture);
    check(unconfigured.status === "local_no_match", "missing Cloud Run configuration uses local signature scan");
    check(
      unconfigured.status === "local_no_match" && unconfigured.scope === "local_catalog",
      "local fallback is explicitly scoped to the local catalog",
    );
  } finally {
    server.close();
    await unlink(fixture).catch(() => {});
    delete process.env["FINGERPRINT_SERVICE_URL"];
    delete process.env["FINGERPRINT_SERVICE_API_KEY"];
    delete process.env["FINGERPRINT_CLOUD_RUN_IAM"];
  }

  console.log(`\nCommercial fingerprint check: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

void main();