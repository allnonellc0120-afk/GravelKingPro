/**
 * Google Search Console API helper.
 *
 * Uses the GCP_SERVICE_ACCOUNT JSON credential (same credential used by
 * Firestore / Vertex AI throughout the project) to obtain an OAuth 2.0
 * access token with the `webmasters` scope, then:
 *   1. Lists existing GSC properties for the service account.
 *   2. Adds the target property if missing.
 *   3. Submits the sitemap.
 *
 * Returns the service account's `client_email` so the caller can surface it
 * to the admin when the API responds with 403 (GSC owner must grant access
 * to that email in the GSC dashboard).
 */

const SITE_URL = "https://gravelkingpro.com/";
const SITEMAP_URL = "https://gravelkingpro.com/sitemap.xml";
const SCOPES = ["https://www.googleapis.com/auth/webmasters"];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface GscResult {
  ok: boolean;
  siteAdded: boolean;
  sitemapSubmitted: boolean;
  serviceAccountEmail: string;
  error?: string;
}

/** Base64url encode a Buffer (no padding). */
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Sign a JWT with the RSA private key and exchange it for an access token. */
async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const { createSign } = await import("node:crypto");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPES.join(" "),
        aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );

  const toSign = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(toSign);
  const sig = b64url(sign.sign(sa.private_key));
  const jwt = `${toSign}.${sig}`;

  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(`Token exchange failed (${resp.status}): ${txt}`);
  }
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Token response missing access_token");
  return data.access_token;
}

/** Wrapper for GSC REST calls. Returns { status, body }. */
async function gscRequest(
  token: string,
  method: string,
  url: string,
): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = await resp.text().catch(() => "");
  }
  return { status: resp.status, body };
}

export async function submitSitemapToGSC(): Promise<GscResult> {
  const raw = process.env.GCP_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail: "(GCP_SERVICE_ACCOUNT not configured)",
      error: "GCP_SERVICE_ACCOUNT environment variable is not set.",
    };
  }

  let sa: ServiceAccountKey;
  try {
    sa = JSON.parse(raw) as ServiceAccountKey;
  } catch {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail: "(parse error)",
      error: "GCP_SERVICE_ACCOUNT is not valid JSON.",
    };
  }

  const serviceAccountEmail = sa.client_email ?? "(unknown)";

  let token: string;
  try {
    token = await getAccessToken(sa);
  } catch (err) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail,
      error: `Failed to obtain access token: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 1. Check if the property already exists.
  const listUrl = "https://searchconsole.googleapis.com/webmasters/v3/sites";
  const listResp = await gscRequest(token, "GET", listUrl);

  if (listResp.status === 403) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      serviceAccountEmail,
      error:
        `The service account does not have access to Google Search Console. ` +
        `Grant "${serviceAccountEmail}" Owner or Full User permission at ` +
        `https://search.google.com/search-console, then click Submit again.`,
    };
  }

  const existingSites = new Set<string>();
  if (listResp.status === 200 && listResp.body && typeof listResp.body === "object") {
    const sites = (listResp.body as { siteEntry?: Array<{ siteUrl?: string }> }).siteEntry ?? [];
    for (const s of sites) {
      if (s.siteUrl) existingSites.add(s.siteUrl);
    }
  }

  // 2. Add the property if missing.
  let siteAdded = false;
  const encodedSite = encodeURIComponent(SITE_URL);
  const siteResourceUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}`;

  if (!existingSites.has(SITE_URL)) {
    const addResp = await gscRequest(token, "PUT", siteResourceUrl);
    if (addResp.status === 403) {
      return {
        ok: false,
        siteAdded: false,
        sitemapSubmitted: false,
        serviceAccountEmail,
        error:
          `The service account cannot add properties to Google Search Console. ` +
          `Grant "${serviceAccountEmail}" Owner or Full User permission at ` +
          `https://search.google.com/search-console, then click Submit again.`,
      };
    }
    // 200/204 = added; already-exists returns 200 too.
    if (addResp.status >= 200 && addResp.status < 300) {
      siteAdded = true;
    } else {
      const errMsg =
        typeof addResp.body === "object" && addResp.body !== null
          ? JSON.stringify(addResp.body)
          : String(addResp.body);
      return {
        ok: false,
        siteAdded: false,
        sitemapSubmitted: false,
        serviceAccountEmail,
        error: `Could not add GSC property (HTTP ${addResp.status}): ${errMsg}`,
      };
    }
  }

  // 3. Submit the sitemap.
  const encodedSitemap = encodeURIComponent(SITEMAP_URL);
  const sitemapUrl = `${siteResourceUrl}/sitemaps/${encodedSitemap}`;
  const sitemapResp = await gscRequest(token, "PUT", sitemapUrl);

  if (sitemapResp.status === 403) {
    return {
      ok: false,
      siteAdded,
      sitemapSubmitted: false,
      serviceAccountEmail,
      error:
        `Sitemap submission was rejected (403). Grant "${serviceAccountEmail}" Owner or Full User ` +
        `permission at https://search.google.com/search-console, then click Submit again.`,
    };
  }

  if (sitemapResp.status >= 200 && sitemapResp.status < 300) {
    return { ok: true, siteAdded, sitemapSubmitted: true, serviceAccountEmail };
  }

  const errMsg =
    typeof sitemapResp.body === "object" && sitemapResp.body !== null
      ? JSON.stringify(sitemapResp.body)
      : String(sitemapResp.body);
  return {
    ok: false,
    siteAdded,
    sitemapSubmitted: false,
    serviceAccountEmail,
    error: `Sitemap submission failed (HTTP ${sitemapResp.status}): ${errMsg}`,
  };
}
