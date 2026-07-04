/**
 * post-track — uploads a real operator-provided track from seeds/assets/ and
 * inserts it as "accepted" directly (no moderation queue for label owner posts).
 *
 * Usage: pnpm --filter @workspace/scripts run post-track
 */

import { db, tracksTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

async function upload(localPath: string, gcsKey: string, contentType: string) {
  process.stdout.write(`  ↑ ${gcsKey} … `);
  const buf = readFileSync(localPath);
  await gcs.bucket(BUCKET_ID).file(gcsKey).save(buf, { contentType });
  process.stdout.write("done\n");
}

const ASSETS_DIR = join(process.cwd(), "..", "seeds", "assets");

const TRACKS = [
  {
    title: "You Used to Think I Was Superman",
    artistName: "TGK, The Gravelking",
    fullFile: "tgk-superman-full.wav",
    previewFile: "tgk-superman-preview.wav",
    coverFile: "tgk-superman-cover.jpg",
    price: 9.99,
  },
];

async function main() {
  for (const t of TRACKS) {
    const slug = t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const artistSlug = t.artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const fullKey    = `private/releases/${artistSlug}/${slug}-full.wav`;
    const previewKey = `releases/${artistSlug}/${slug}-preview.wav`;
    const coverKey   = `releases/${artistSlug}/${slug}-cover.jpg`;

    // Idempotency check
    const existing = await db.select({ id: tracksTable.id }).from(tracksTable)
      .where(and(eq(tracksTable.title, t.title), eq(tracksTable.artistName, t.artistName)));

    if (existing.length > 0) {
      console.log(`  skip  "${t.title}" (already in DB)`);
      continue;
    }

    await upload(join(ASSETS_DIR, t.fullFile),    fullKey,    "audio/wav");
    await upload(join(ASSETS_DIR, t.previewFile), previewKey, "audio/wav");
    await upload(join(ASSETS_DIR, t.coverFile),   coverKey,   "image/jpeg");

    await db.insert(tracksTable).values({
      title: t.title,
      artistName: t.artistName,
      audioFullKey: fullKey,
      audioPreviewKey: previewKey,
      coverArtKey: coverKey,
      price: t.price,
      status: "accepted",   // label owner tracks go live immediately
    });

    console.log(`  ✓  "${t.title}" by ${t.artistName} posted`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
