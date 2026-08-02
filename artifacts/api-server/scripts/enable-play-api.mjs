// Enable the Google Play Developer API in the SA's GCP project.
// Run from artifacts/api-server: node scripts/enable-play-api.mjs
import { GoogleAuth } from "google-auth-library";

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const resp = await fetch(
  `https://serviceusage.googleapis.com/v1/projects/${creds.project_id}/services/androidpublisher.googleapis.com:enable`,
  { method: "POST", headers: { Authorization: `Bearer ${token}` } }
);
console.log("androidpublisher enable:", resp.status, JSON.stringify(await resp.json().catch(() => null))?.slice(0, 200));
