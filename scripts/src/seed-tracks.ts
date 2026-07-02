/**
 * seed-tracks — inserts demo tracks for Founder and Hope LaBorde, generating
 * real WAV and PNG assets and uploading them to App Storage.
 *
 * Usage: pnpm --filter @workspace/scripts run seed-tracks
 *
 * Idempotent: tracks already in the DB (matched by title + artistName) are skipped.
 * Existing GCS objects at the same key are also silently overwritten.
 */

import { db, tracksTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { deflateSync } from "node:zlib";

// ── GCS client (Replit sidecar credentials, same as api-server/objectStorage) ─

const SIDECAR = "http://127.0.0.1:1106";
const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

/** First configured public search path (e.g. "<bucket>/public"). */
function getPublicSearchPath(): string {
  return (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)[0] ?? "";
}

/** Split a "<bucket>/<object...>" path into its bucket and object name. */
function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  return { bucketName: parts[1] ?? "", objectName: parts.slice(2).join("/") };
}

/** Upload a PRIVATE asset (full audio) to the bucket root under private/. */
async function uploadPrivateBuffer(buffer: Buffer, key: string, contentType: string): Promise<void> {
  if (!BUCKET_ID) {
    console.warn(`  [warn] DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — skipping GCS upload for ${key}`);
    return;
  }
  await gcs.bucket(BUCKET_ID).file(key).save(buffer, { contentType });
}

/**
 * Upload a PUBLIC asset (cover art, preview clip) UNDER the PUBLIC_OBJECT_SEARCH_PATHS
 * prefix, using the same path construction the api-server serve route reads with
 * (searchPublicObject / savePublicObject). Writing to the bucket root instead would
 * leave covers blank and previews unplayable — the serve route prepends the prefix,
 * so a bucket-root object at `<bucket>/<key>` can never be found at `<bucket>/public/<key>`.
 */
async function uploadPublicBuffer(buffer: Buffer, key: string, contentType: string): Promise<void> {
  const searchPath = getPublicSearchPath();
  if (!searchPath) {
    console.warn(`  [warn] PUBLIC_OBJECT_SEARCH_PATHS not set — skipping GCS upload for ${key}`);
    return;
  }
  const { bucketName, objectName } = parseObjectPath(`${searchPath}/${key}`);
  await gcs.bucket(bucketName).file(objectName).save(buffer, { contentType });
}

// ── WAV generation ────────────────────────────────────────────────────────────

/** Generate a valid WAV file containing `durationSeconds` of stereo silence. */
function createSilenceWav(durationSeconds = 2): Buffer {
  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataSize, 0);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

// ── PNG generation (pure Node.js — no third-party PNG lib) ───────────────────

/** Standard CRC-32 lookup-table implementation. */
function computeCrc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(computeCrc32(crcInput));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

/** Generate a valid 100×100 solid-color PNG. */
function createSolidColorPng(r: number, g: number, b: number): Buffer {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const W = 100, H = 100;

  const ihdr = Buffer.alloc(13, 0);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB

  const rowLen = 1 + W * 3; // filter byte + R G B per pixel
  const raw = Buffer.alloc(H * rowLen, 0);
  for (let y = 0; y < H; y++) {
    const base = y * rowLen;
    raw[base] = 0; // filter type: None
    for (let x = 0; x < W; x++) {
      raw[base + 1 + x * 3] = r;
      raw[base + 2 + x * 3] = g;
      raw[base + 3 + x * 3] = b;
    }
  }

  return Buffer.concat([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Demo track definitions ────────────────────────────────────────────────────

interface DemoTrack {
  artistName: string;
  title: string;
  audioFullDuration: number;
  audioPreviewDuration: number;
  coverR: number;
  coverG: number;
  coverB: number;
}

const DEMO_TRACKS: DemoTrack[] = [
  // Founder — dark amber cover
  { artistName: "Founder", title: "Gravel Road Origin",  audioFullDuration: 5, audioPreviewDuration: 2, coverR: 180, coverG: 120, coverB: 20 },
  { artistName: "Founder", title: "Morris Law Theme",    audioFullDuration: 5, audioPreviewDuration: 2, coverR: 160, coverG: 90,  coverB: 10 },
  { artistName: "Founder", title: "Node 1T",             audioFullDuration: 5, audioPreviewDuration: 2, coverR: 200, coverG: 150, coverB: 30 },
  { artistName: "Founder", title: "Benchmark Session",   audioFullDuration: 5, audioPreviewDuration: 2, coverR: 140, coverG: 80,  coverB: 0  },
  // Hope LaBorde — personal song
  { artistName: "Hope Of The Free World", title: "I Wanna Recognize Me", audioFullDuration: 5, audioPreviewDuration: 2, coverR: 120, coverG: 200, coverB: 180 },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fail fast: without these the uploads silently no-op, leaving "accepted" demo
  // rows that point at missing cover/preview objects (blank covers, no preview).
  if (!BUCKET_ID || !getPublicSearchPath()) {
    console.error(
      "Seed aborted: DEFAULT_OBJECT_STORAGE_BUCKET_ID and PUBLIC_OBJECT_SEARCH_PATHS " +
        "must both be set so cover/preview assets can be uploaded.",
    );
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;

  for (const t of DEMO_TRACKS) {
    // Idempotency: skip if (title, artistName) already exists
    const existing = await db
      .select({ id: tracksTable.id })
      .from(tracksTable)
      .where(and(eq(tracksTable.title, t.title), eq(tracksTable.artistName, t.artistName)));

    if (existing.length > 0) {
      console.log(`  skip  "${t.title}" by ${t.artistName} (already exists)`);
      skipped++;
      continue;
    }

    const slug = t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const artistSlug = t.artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const prefix = `demo/${artistSlug}/${slug}`;

    // Full audio stored under private/ so it cannot be reached via public-objects route
    const audioFullKey = `private/${prefix}-full.wav`;
    const audioPreviewKey = `${prefix}-preview.wav`;
    const coverArtKey = `${prefix}-cover.png`;

    const fullWav = createSilenceWav(t.audioFullDuration);
    const previewWav = createSilenceWav(t.audioPreviewDuration);
    const coverPng = createSolidColorPng(t.coverR, t.coverG, t.coverB);

    process.stdout.write(`  ↑  Uploading assets for "${t.title}" by ${t.artistName}…`);
    await Promise.all([
      // Full audio is private — bucket root under private/, read by the gated download route.
      uploadPrivateBuffer(fullWav, audioFullKey, "audio/wav"),
      // Preview + cover are public — must live under the public search-path prefix.
      uploadPublicBuffer(previewWav, audioPreviewKey, "audio/wav"),
      uploadPublicBuffer(coverPng, coverArtKey, "image/png"),
    ]);
    process.stdout.write(" done\n");

    await db.insert(tracksTable).values({
      title: t.title,
      artistName: t.artistName,
      audioFullKey,
      audioPreviewKey,
      coverArtKey,
      price: 9.99,
      status: "accepted",
    });

    console.log(`  ✓  "${t.title}" by ${t.artistName} inserted`);
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped (already exists): ${skipped}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
