// Build-time prerender: generates a static HTML document per public route with
// route-specific <title>, description, canonical, and Open Graph/Twitter tags,
// plus a sitemap.xml. Run after `vite build` (see package.json build script).
//
// Crawlers and social bots read the initial HTML response without executing JS,
// so each public URL must ship its own metadata. The client-side RouteSeo hook
// (src/lib/seo.tsx) keeps the head in sync during SPA navigation.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist", "public");
const config = JSON.parse(readFileSync(join(root, "seo.config.json"), "utf8"));
const appleAssociationPath = join(
  dist,
  ".well-known",
  "apple-developer-merchantid-domain-association",
);
const appleAssociationResponse = await fetch(
  "https://js.stripe.com/.well-known/apple-developer-merchantid-domain-association",
  { signal: AbortSignal.timeout(20_000) },
);
if (!appleAssociationResponse.ok) {
  throw new Error(
    `prerender: Stripe Apple verification file fetch failed with HTTP ${appleAssociationResponse.status}`,
  );
}
const appleAssociation = (await appleAssociationResponse.text()).trim();
if (!/^[0-9a-f]+$/i.test(appleAssociation) || appleAssociation.length < 1_000) {
  throw new Error(
    "prerender: Stripe Apple verification response is missing or invalid",
  );
}
try {
  const decoded = JSON.parse(
    Buffer.from(appleAssociation, "hex").toString("utf8"),
  );
  if (
    typeof decoded?.pspId !== "string" ||
    typeof decoded?.signature !== "string"
  ) {
    throw new Error("missing signed association fields");
  }
} catch (error) {
  throw new Error(
    `prerender: Stripe Apple verification response is malformed: ${error.message}`,
  );
}
mkdirSync(dirname(appleAssociationPath), { recursive: true });
writeFileSync(appleAssociationPath, `${appleAssociation}\n`);

const START = "<!-- SEO:START -->";
const END = "<!-- SEO:END -->";

const template = readFileSync(join(dist, "index.html"), "utf8");
if (!template.includes(START) || !template.includes(END)) {
  throw new Error(
    `prerender: SEO markers (${START} / ${END}) not found in built index.html. ` +
      `Vite may have stripped the comments — adjust the marker strategy.`,
  );
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const canonicalFor = (path) =>
  `${config.siteUrl}${path === "/" ? "/" : path.replace(/\/$/, "")}`;

const ogImageUrl = `${config.siteUrl}${config.ogImage}`;

function seoBlock(route) {
  const url = canonicalFor(route.path);
  return [
    START,
    `    <title>${esc(route.title)}</title>`,
    `    <meta name="description" content="${esc(route.description)}" />`,
    `    <link rel="canonical" href="${url}" />`,
    `    <meta property="og:title" content="${esc(route.title)}" />`,
    `    <meta property="og:description" content="${esc(route.description)}" />`,
    `    <meta property="og:type" content="${esc(route.ogType || "website")}" />`,
    `    <meta property="og:url" content="${url}" />`,
    `    <meta property="og:image" content="${ogImageUrl}" />`,
    `    <meta property="og:image:alt" content="${esc(config.ogImageAlt)}" />`,
    `    <meta property="og:image:width" content="${config.ogImageWidth}" />`,
    `    <meta property="og:image:height" content="${config.ogImageHeight}" />`,
    `    <meta name="twitter:card" content="${esc(config.twitterCard)}" />`,
    `    <meta name="twitter:title" content="${esc(route.title)}" />`,
    `    <meta name="twitter:description" content="${esc(route.description)}" />`,
    `    <meta name="twitter:image" content="${ogImageUrl}" />`,
    `    ${END}`,
  ].join("\n");
}

const blockRe = new RegExp(`${START}[\\s\\S]*?${END}`);
const rootRe = /<div id="root"><\/div>/;

function crawlerSummary(route) {
  return [
    '    <div id="root">',
    "      <noscript>",
    `        <main><h1>${esc(route.title)}</h1><p>${esc(route.description)}</p>`,
    `        <p><a href="${canonicalFor(route.path)}">Open ${esc(config.siteName)}</a></p></main>`,
    "      </noscript>",
    "    </div>",
  ].join("\n");
}

function renderRoute(route) {
  const html = template
    .replace(blockRe, seoBlock(route))
    .replace(rootRe, crawlerSummary(route));
  if (route.path === "/") {
    writeFileSync(join(dist, "index.html"), html);
    return "index.html";
  }
  const rel = route.path.replace(/^\//, "");
  // Flat file ONLY, served via an exact artifact.toml rewrite. Do NOT also
  // emit <route>/index.html: a real directory makes the static host 301
  // /<route> → /<route>/, and that trailing-slash request bypasses the exact
  // rewrite and lands on the /* fallback — every page then serves the ROOT
  // SEO block and Google sees the whole site as duplicates of home.
  writeFileSync(join(dist, `${rel}.html`), html);
  return `${rel}.html`;
}

const written = config.routes.map(renderRoute);

const lastmod = new Date().toISOString().slice(0, 10);

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...config.routes.map((r) => {
    const priority = r.path === "/" ? "1.0" : "0.8";
    return [
      "  <url>",
      `    <loc>${canonicalFor(r.path)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      "    <changefreq>weekly</changefreq>",
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  }),
  "</urlset>",
  "",
].join("\n");

writeFileSync(join(dist, "sitemap.xml"), sitemap);

console.log(
  `prerender: wrote ${written.length} route document(s) [${written.join(", ")}] + sitemap.xml`,
);
