/**
 * Bing Webmaster Tools API helper.
 *
 * Uses the BING_API_KEY secret to:
 *   1. Add the site property (if not already added).
 *   2. Submit the sitemap.
 *
 * Bing WMT API v1 reference:
 *   https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api
 */

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const SITE_URL = "https://gravelkingpro.com/";
const SITEMAP_URL = "https://gravelkingpro.com/sitemap.xml";

export interface BingResult {
  ok: boolean;
  siteAdded: boolean;
  sitemapSubmitted: boolean;
  error?: string;
}

/** POST to a Bing WMT JSON endpoint and return { status, body }. */
async function bingRequest(
  apiKey: string,
  endpoint: string,
  body: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const url = `${BING_API_BASE}/${endpoint}?apikey=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  let parsed: unknown;
  try {
    parsed = await resp.json();
  } catch {
    parsed = await resp.text().catch(() => "");
  }
  return { status: resp.status, body: parsed };
}

export async function submitSitemapToBing(): Promise<BingResult> {
  const apiKey = process.env.BING_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      error:
        "BING_API_KEY environment variable is not set. " +
        "Get your key at https://www.bing.com/webmasters → Settings → API access.",
    };
  }

  // 1. Add the site. Bing returns 200 with d:null if already added.
  let siteAdded = false;
  const addResp = await bingRequest(apiKey, "AddSite", { siteUrl: SITE_URL });

  if (addResp.status === 401 || addResp.status === 403) {
    return {
      ok: false,
      siteAdded: false,
      sitemapSubmitted: false,
      error:
        `Bing API key is invalid or does not have permission (HTTP ${addResp.status}). ` +
        "Check your key at https://www.bing.com/webmasters → Settings → API access.",
    };
  }

  if (addResp.status >= 200 && addResp.status < 300) {
    // d: null means success; if the site was already present Bing still returns 200.
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
      error: `Could not add site to Bing Webmaster Tools (HTTP ${addResp.status}): ${errMsg}`,
    };
  }

  // 2. Submit the sitemap.
  const sitemapResp = await bingRequest(apiKey, "SubmitSitemap", {
    siteUrl: SITE_URL,
    sitemapUrl: SITEMAP_URL,
  });

  if (sitemapResp.status === 401 || sitemapResp.status === 403) {
    return {
      ok: false,
      siteAdded,
      sitemapSubmitted: false,
      error:
        `Sitemap submission rejected by Bing (HTTP ${sitemapResp.status}). ` +
        "Verify your API key has write access.",
    };
  }

  if (sitemapResp.status >= 200 && sitemapResp.status < 300) {
    return { ok: true, siteAdded, sitemapSubmitted: true };
  }

  const errMsg =
    typeof sitemapResp.body === "object" && sitemapResp.body !== null
      ? JSON.stringify(sitemapResp.body)
      : String(sitemapResp.body);
  return {
    ok: false,
    siteAdded,
    sitemapSubmitted: false,
    error: `Sitemap submission failed (HTTP ${sitemapResp.status}): ${errMsg}`,
  };
}
