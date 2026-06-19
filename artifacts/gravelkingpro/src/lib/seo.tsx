import { useEffect } from "react";
import { useLocation } from "wouter";
import seoConfig from "../../seo.config.json";

type RouteMeta = {
  path: string;
  title: string;
  description: string;
  ogType: string;
};

const ABS = (path: string) =>
  `${seoConfig.siteUrl}${path === "/" ? "/" : path.replace(/\/$/, "")}`;

function metaForPath(pathname: string): RouteMeta {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const match = (seoConfig.routes as RouteMeta[]).find(
    (r) => r.path === normalized,
  );
  return (
    match ?? {
      path: normalized,
      title: seoConfig.defaultTitle,
      description: seoConfig.defaultDescription,
      ogType: "website",
    }
  );
}

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
): void {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Keeps the document head in sync with the current route for client-side
 * navigation. The initial HTML for public routes is prerendered at build time
 * (see prerender.mjs); this hook handles SPA transitions and any route that is
 * not prerendered. Crawlers that do not execute JS still get correct tags from
 * the prerendered HTML.
 */
export function RouteSeo() {
  const [location] = useLocation();

  useEffect(() => {
    const meta = metaForPath(location || "/");
    const canonical = ABS(meta.path);

    document.title = meta.title;
    upsertMeta("name", "description", meta.description);
    upsertCanonical(canonical);

    upsertMeta("property", "og:title", meta.title);
    upsertMeta("property", "og:description", meta.description);
    upsertMeta("property", "og:type", meta.ogType);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", `${seoConfig.siteUrl}${seoConfig.ogImage}`);

    upsertMeta("name", "twitter:title", meta.title);
    upsertMeta("name", "twitter:description", meta.description);
    upsertMeta("name", "twitter:image", `${seoConfig.siteUrl}${seoConfig.ogImage}`);
  }, [location]);

  return null;
}
