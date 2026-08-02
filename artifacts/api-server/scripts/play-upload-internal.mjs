// Upload a TWA .aab to Google Play internal testing track.
// Run from artifacts/api-server: node scripts/play-upload-internal.mjs <path-to-aab>
import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "node:fs";

const PKG = "com.gravelkingpro.app";
const aabPath = process.argv[2];
if (!aabPath) { console.error("usage: node play-upload-internal.mjs <aab>"); process.exit(1); }

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
const H = { Authorization: `Bearer ${token}` };
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

async function j(resp) {
  const body = await resp.json().catch(() => null);
  if (!resp.ok) { console.error("FAIL", resp.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

// 1. open edit
const edit = await j(await fetch(`${base}/edits`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" }));
console.log("edit id:", edit.id);

// 2. upload bundle
const bytes = readFileSync(aabPath);
const up = await j(await fetch(
  `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`,
  { method: "POST", headers: { ...H, "Content-Type": "application/octet-stream" }, body: bytes }
));
console.log("uploaded bundle versionCode:", up.versionCode, "sha256:", up.sha256);

// 3. assign to internal track
const track = await j(await fetch(`${base}/edits/${edit.id}/tracks/internal`, {
  method: "PUT",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({
    track: "internal",
    releases: [{
      name: "1.0.0 internal",
      versionCodes: [String(up.versionCode)],
      status: "completed",
      releaseNotes: [{ language: "en-US", text: "First internal release: GravelKing Pro web app (TWA) — AI mastering, vocal booth, karaoke DAW, IP certification." }],
    }],
  }),
}));
console.log("track set:", JSON.stringify(track));

// 4. commit edit
const commit = await j(await fetch(`${base}/edits/${edit.id}:commit`, { method: "POST", headers: H }));
console.log("committed edit:", commit.id);
