import type { RequestHandler } from "express";

export const STORK_WIRE_URL = "https://www.stork.ai/wire/wa3l9nvf14gbmqa40";
const NEWS_PATH = "/news";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const STORK_MARKER = "<!-- stork-wire: -->";

export function getStorkTargetUrl(originalUrl: string): string {
  const incoming = new URL(originalUrl, "http://same-origin.invalid");
  const isNewsPath = incoming.pathname === NEWS_PATH || incoming.pathname.startsWith(`${NEWS_PATH}/`);
  const suffix = isNewsPath
    ? incoming.pathname.slice(NEWS_PATH.length)
    : "";
  const target = new URL(STORK_WIRE_URL);
  target.pathname = `${target.pathname}${suffix}`;
  target.search = incoming.search;
  return target.toString();
}

export function createNewsProxy(fetchUpstream: typeof fetch = fetch): RequestHandler {
  return async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.status(405).send("News proxy supports GET and HEAD requests only.");
      return;
    }

    try {
      const targetUrl = getStorkTargetUrl(req.originalUrl);
      const upstream = await fetchUpstream(targetUrl, {
        method: req.method,
        headers: {
          accept: req.header("accept") ?? "text/html,application/xhtml+xml,*/*",
          ...(req.header("accept-language")
            ? { "accept-language": req.header("accept-language") as string }
            : {}),
          ...(req.header("user-agent") ? { "user-agent": req.header("user-agent") as string } : {}),
        },
        // Follow upstream redirects server-side so the browser remains on /news.
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });

      // Keep the proxy target easy to verify with a HEAD request, whose body
      // cannot include the HTML marker below.
      for (const [name, value] of upstream.headers) {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) res.setHeader(name, value);
      }
      res.setHeader("stork-wire", "proxied");

      res.status(upstream.status);
      if (req.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
        res.end();
        return;
      }

      const contentType = upstream.headers.get("content-type") ?? "";
      if (upstream.ok && /(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) {
        let html = await upstream.text();
        if (!html.includes("stork-wire:")) {
          const closingBody = /<\/body\s*>/i;
          html = closingBody.test(html)
            ? html.replace(closingBody, `${STORK_MARKER}</body>`)
            : `${html}${STORK_MARKER}`;
        }
        res.send(html);
        return;
      }

      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upstream error";
      res.status(502).type("text/plain").send(`Stork Wire proxy failed: ${message}`);
    }
  };
}