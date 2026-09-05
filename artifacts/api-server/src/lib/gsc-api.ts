/**
 * Google Search Console API helper.
 * Uses the same GCP_SERVICE_ACCOUNT credential as Firestore + Vertex AI.
 * Scope: https://www.googleapis.com/auth/webmasters
 */
import { GoogleAuth } from "google-auth-library";

const SITE_URL = "https://gravelkingpro.com/";
const SITEMAP_URL = "https://gravelkingpro.com/sitemap.xml";
const GSC_BASE = "https://www.googleapis.com/webmasters/v3";

export interface GscResult {
  ok: boolean;
  siteAdded: boolean;
  sitemapSubmitted: boolean;
  serviceAccountEmail: string;
  sitesListed: string[];
  error?: string;
  needsAccessGrant?: boolean;
}

async function getToken(): Promise<{ token: string; email: string }> {
  const raw = process.env.GCP_SERVICE_ACCOUNT ?? "";
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT not configured");
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };

  const auth = new GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });

  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = tokenResp?.token;
  if (!token) throw new Error("Failed to obtain access token from service account");
  return { token, email: creds.client_email };
}

async function gscFetch(
  token: string,
  method: string,
  path: string
): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${GSC_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }
  return { status: resp.status, body };
}

export async function submitSitemapToGSC(): Promise<GscResult> {
  let token: string;
  let email: string;

  try {
    ({ token, email } = await getToken());
  } catch (err) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail: "",
      sitesListed: [],
      error: err instanceof Error ? err.message : "Auth failed",
    };
  }

  // 1. List existing sites to check current access
  const listResp = await gscFetch(token, "GET", "/sites");
  const sitesListed: string[] = [];

  if (listResp.status === 403) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail: email,
      sitesListed: [],
      needsAccessGrant: true,
      error:
        `The service account (${email}) does not yet have Search Console access. ` +
        `In Google Search Console → Settings → Users and permissions → Add user, ` +
        `add "${email}" as Owner or Full user, then click Submit again.`,
    };
  }

  if (listResp.status === 200 && listResp.body && typeof listResp.body === "object") {
    const body = listResp.body as { siteEntry?: Array<{ siteUrl?: string }> };
    for (const entry of body.siteEntry ?? []) {
      if (entry.siteUrl) sitesListed.push(entry.siteUrl);
    }
  }

  // 2. Add the site (idempotent — 200 if already present, 204 on add)
  const encodedSite = encodeURIComponent(SITE_URL);
  const addResp = await gscFetch(token, "PUT", `/sites/${encodedSite}`);
  const siteAdded = addResp.status === 200 || addResp.status === 204;

  if (!siteAdded && addResp.status === 403) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail: email,
      sitesListed,
      needsAccessGrant: true,
      error:
        `Permission denied adding site. Grant "${email}" Owner access in Search Console, then try again.`,
    };
  }

  // 3. Submit sitemap
  const encodedSitemap = encodeURIComponent(SITEMAP_URL);
  const smResp = await gscFetch(
    token,
    "PUT",
    `/sites/${encodedSite}/sitemaps/${encodedSitemap}`
  );
  const sitemapSubmitted = smResp.status === 200 || smResp.status === 204;

  if (!sitemapSubmitted) {
    return {
      ok: false,
      siteAdded,
      sitemapSubmitted: false,
      serviceAccountEmail: email,
      sitesListed,
      error: `Sitemap submission failed (HTTP ${smResp.status}). The site was ${siteAdded ? "added" : "not added"} successfully.`,
    };
  }

  return {
    ok: true,
    siteAdded,
    sitemapSubmitted: true,
    serviceAccountEmail: email,
    sitesListed,
  };
}
