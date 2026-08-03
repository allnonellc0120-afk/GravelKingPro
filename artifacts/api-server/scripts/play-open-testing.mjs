// Upload a TWA .aab to the Google Play OPEN TESTING (beta) track as a draft release.
// Run: node scripts/play-open-testing.mjs <path-to-aab>
import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "node:fs";

const PKG = "com.gravelkingpro.app";
const aabPath = process.argv[2];
if (!aabPath) { console.error("usage: node play-open-testing.mjs <aab>"); process.exit(1); }

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
const H = { Authorization: `Bearer ${token}` };
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

async function j(resp, label) {
  const body = await resp.json().catch(() => null);
  if (!resp.ok) { console.error("FAIL", label, resp.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

// 1. open edit
const edit = await j(await fetch(`${base}/edits`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" }), "open edit");
console.log("edit id:", edit.id);

// list current tracks for visibility
const tracks = await j(await fetch(`${base}/edits/${edit.id}/tracks`, { headers: H }), "list tracks");
console.log("existing tracks:", JSON.stringify(tracks.tracks?.map(t => ({ track: t.track, releases: t.releases?.map(r => ({ status: r.status, versionCodes: r.versionCodes })) })), null, 1));

// 2. upload bundle
const bytes = readFileSync(aabPath);
const up = await j(await fetch(
  `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`,
  { method: "POST", headers: { ...H, "Content-Type": "application/octet-stream" }, body: bytes }
), "upload bundle");
console.log("uploaded bundle versionCode:", up.versionCode, "sha256:", up.sha256);

// 3. assign to open testing (beta) track as draft
const track = await j(await fetch(`${base}/edits/${edit.id}/tracks/beta`, {
  method: "PUT",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({
    track: "beta",
    releases: [{
      name: "1.0.2 open testing",
      versionCodes: [String(up.versionCode)],
      status: "draft",
      releaseNotes: [{ language: "en-US", text: "GravelKing Pro: AI mastering, vocal booth, karaoke DAW, and IP rights certification." }],
    }],
  }),
}), "set beta track");
console.log("track set:", JSON.stringify(track));

// 4. commit edit
const commit = await j(await fetch(`${base}/edits/${edit.id}:commit`, { method: "POST", headers: H }), "commit");
console.log("committed edit:", commit.id);
