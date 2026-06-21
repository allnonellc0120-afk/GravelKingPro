/**
 * seed-tracks — inserts demo tracks for Founder and Hope LaBorde into the DB.
 *
 * Usage: pnpm --filter @workspace/scripts run seed-tracks
 *
 * This inserts accepted track records. The audio/cover art files referenced by
 * the keys do not need to exist in object storage for the DB to be seeded.
 * Upload real files to these keys via the admin panel or object storage to make
 * covers and previews work in the storefront.
 */

import { db, tracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEMO_TRACKS = [
  {
    artistName: "Founder",
    tracks: [
      {
        title: "Gravel Road Origin",
        audioFullKey: "demo/founder/gravel-road-origin-full.wav",
        audioPreviewKey: "demo/founder/gravel-road-origin-preview.mp3",
        coverArtKey: "demo/founder/gravel-road-origin-cover.jpg",
        price: 9.99,
      },
      {
        title: "Morris Law Theme",
        audioFullKey: "demo/founder/morris-law-theme-full.wav",
        audioPreviewKey: "demo/founder/morris-law-theme-preview.mp3",
        coverArtKey: "demo/founder/morris-law-theme-cover.jpg",
        price: 9.99,
      },
      {
        title: "Node 1T",
        audioFullKey: "demo/founder/node-1t-full.wav",
        audioPreviewKey: "demo/founder/node-1t-preview.mp3",
        coverArtKey: "demo/founder/node-1t-cover.jpg",
        price: 9.99,
      },
      {
        title: "Benchmark Session",
        audioFullKey: "demo/founder/benchmark-session-full.wav",
        audioPreviewKey: "demo/founder/benchmark-session-preview.mp3",
        coverArtKey: "demo/founder/benchmark-session-cover.jpg",
        price: 9.99,
      },
    ],
  },
  {
    artistName: "Hope LaBorde",
    tracks: [
      {
        title: "Signal Path",
        audioFullKey: "demo/hope-laborde/signal-path-full.wav",
        audioPreviewKey: "demo/hope-laborde/signal-path-preview.mp3",
        coverArtKey: "demo/hope-laborde/signal-path-cover.jpg",
        price: 9.99,
      },
      {
        title: "Carve the Noise",
        audioFullKey: "demo/hope-laborde/carve-the-noise-full.wav",
        audioPreviewKey: "demo/hope-laborde/carve-the-noise-preview.mp3",
        coverArtKey: "demo/hope-laborde/carve-the-noise-cover.jpg",
        price: 9.99,
      },
      {
        title: "Stem Split",
        audioFullKey: "demo/hope-laborde/stem-split-full.wav",
        audioPreviewKey: "demo/hope-laborde/stem-split-preview.mp3",
        coverArtKey: "demo/hope-laborde/stem-split-cover.jpg",
        price: 9.99,
      },
    ],
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const artist of DEMO_TRACKS) {
    for (const t of artist.tracks) {
      const existing = await db
        .select({ id: tracksTable.id })
        .from(tracksTable)
        .where(eq(tracksTable.title, t.title));

      if (existing.length > 0) {
        console.log(`  skip  "${t.title}" by ${artist.artistName} (already exists)`);
        skipped++;
        continue;
      }

      await db.insert(tracksTable).values({
        title: t.title,
        artistName: artist.artistName,
        audioFullKey: t.audioFullKey,
        audioPreviewKey: t.audioPreviewKey,
        coverArtKey: t.coverArtKey,
        price: t.price,
        status: "accepted",
      });

      console.log(`  ✓  "${t.title}" by ${artist.artistName}`);
      inserted++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped (already exists): ${skipped}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
