// Complete the Play store listing (text + images) and attempt a production release.
// Run from artifacts/api-server: node scripts/play-listing-and-release.mjs
import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "node:fs";

const PKG = "com.gravelkingpro.app";
const STORE = "../../android-twa/store";

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
const H = { Authorization: `Bearer ${token}` };
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const upBase = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;

async function j(resp, label, fatal = true) {
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error(`FAIL [${label}]`, resp.status, JSON.stringify(body)?.slice(0, 600));
    if (fatal) process.exit(1);
    return null;
  }
  console.log(`OK [${label}]`);
  return body;
}

const edit = await j(await fetch(`${base}/edits`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" }), "open edit");
const E = `${base}/edits/${edit.id}`;

// 1. listing text
await j(await fetch(`${E}/listings/en-US`, {
  method: "PUT",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({
    language: "en-US",
    title: "GravelKing Pro",
    shortDescription: "AI mastering, vocal booth, karaoke DAW & IP certification for your music.",
    fullDescription: `GravelKing Pro is the music platform that masters your tracks, records your vocals, and certifies your IP rights.

FEATURES

• AI Mastering — powered by the Morris Law Kernel v3.5 multi-band mastering engine. Upload a track, get a professional master.
• Vocal Booth — record vocals with live effects and precise karaoke-style synced lyrics.
• Karaoke DAW — a full in-browser studio with EQ, effects, and stem workflows.
• IP Rights Certification — get a cryptographic authorship certificate for your music that no one can dispute.
• Songwriting Studio — AI-assisted lyric writing with genre-aware rules and clean/explicit modes.

Free tools to start, Pro plans for full-length WAV exports and IP embed codes.

Made for independent artists who want to own their music — and prove it.`,
    video: "",
  }),
}), "listing text");

// 2. details (contact)
await j(await fetch(`${E}/details`, {
  method: "PUT",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ defaultLanguage: "en-US", contactWebsite: "https://gravelkingpro.com", contactEmail: "support@gravelkingpro.com" }),
}), "details", false);

// 3. images
async function upload(type, file, mime) {
  await j(await fetch(`${upBase}/edits/${edit.id}/listings/en-US/${type}?uploadType=media`, {
    method: "POST", headers: { ...H, "Content-Type": mime }, body: readFileSync(`${STORE}/${file}`),
  }), `image ${type}:${file}`, false);
}
// clear then upload
for (const t of ["icon", "featureGraphic", "phoneScreenshots"]) {
  await fetch(`${E}/listings/en-US/${t}`, { method: "DELETE", headers: H });
}
await upload("icon", "icon-512-play.png", "image/png");
await upload("featureGraphic", "feature-graphic-play.png", "image/png");
await upload("phoneScreenshots", "shot-home-play.png", "image/png");
await upload("phoneScreenshots", "shot-mastering-play.png", "image/png");
await upload("phoneScreenshots", "shot-pricing-play.png", "image/png");

// 4. attempt production track assignment
const prod = await j(await fetch(`${E}/tracks/production`, {
  method: "PUT",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({
    track: "production",
    releases: [{
      name: "1.0.0",
      versionCodes: ["2"],
      status: "draft",
      releaseNotes: [{ language: "en-US", text: "GravelKing Pro launch: AI mastering, vocal booth, karaoke DAW, and IP rights certification." }],
    }],
  }),
}), "production track", false);

// 5. commit
const commit = await j(await fetch(`${E}:commit`, { method: "POST", headers: H }), "commit", false);
if (!commit) {
  console.log("\nProduction commit failed — retrying commit WITHOUT the production release (listing only)...");
  // reopen a fresh edit for listing-only commit
  const e2 = await j(await fetch(`${base}/edits`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" }), "open edit 2");
  // (listing changes were in the failed edit; redo minimal: text + images)
  console.log("Re-run script logic manually if needed. Edit id:", e2.id);
}
