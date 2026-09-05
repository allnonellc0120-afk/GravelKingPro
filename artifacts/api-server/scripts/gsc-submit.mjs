// One-shot Google Search Console submission: verifies the service account's
// access, adds the site (idempotent), and submits the sitemap.
// Run from artifacts/api-server so google-auth-library resolves:
//   node scripts/gsc-submit.mjs
import { GoogleAuth } from "google-auth-library";

const SITE_URL = "https://gravelkingpro.com/";
const SITEMAP_URL = "https://gravelkingpro.com/sitemap.xml";
const GSC_BASE = "https://www.googleapis.com/webmasters/v3";

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
if (!creds.client_email || !creds.private_key) {
  console.error("GCP_SERVICE_ACCOUNT not configured");
  process.exit(1);
}
console.log("Service account:", creds.client_email);

const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/webmasters"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
if (!token) throw new Error("no access token");

async function gsc(method, path) {
  const resp = await fetch(`${GSC_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  let body = null;
  try { body = await resp.json(); } catch { /* empty */ }
  return { status: resp.status, body };
}

const list = await gsc("GET", "/sites");
console.log("GET /sites:", list.status, JSON.stringify(list.body)?.slice(0, 400));

const encSite = encodeURIComponent(SITE_URL);
const add = await gsc("PUT", `/sites/${encSite}`);
console.log("PUT site:", add.status, JSON.stringify(add.body)?.slice(0, 200));

const encMap = encodeURIComponent(SITEMAP_URL);
const sm = await gsc("PUT", `/sites/${encSite}/sitemaps/${encMap}`);
console.log("PUT sitemap:", sm.status, JSON.stringify(sm.body)?.slice(0, 200));

const check = await gsc("GET", `/sites/${encSite}/sitemaps/${encMap}`);
console.log("GET sitemap state:", check.status, JSON.stringify(check.body)?.slice(0, 400));
