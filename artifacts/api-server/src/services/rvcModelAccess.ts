import { createHmac } from "node:crypto";

export const GRAVELKING_RVC_MODEL_KEY = "models/gravelking_v2.pth";
export const GRAVELKING_RVC_INDEX_KEY = "models/gravelking_v2.index";
export const GRAVELKING_RVC_MODEL_FILENAME = "gravelking_v2.zip";

function normalizeOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim().includes("://") ? value.trim() : `https://${value.trim()}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") return null;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Replicate must fetch the model from a publicly reachable server. In local
 * preview, the request host is often a private proxy hostname, so prefer the
 * explicit relay origin or the deployed Replit domain.
 */
export function resolveRvcModelOrigin(requestOrigin?: string): string {
  const configured = normalizeOrigin(process.env.RVC_MODEL_PUBLIC_ORIGIN);
  if (configured) return configured;

  const productionDomain = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((domain) => normalizeOrigin(domain))
    .find(Boolean);
  if (productionDomain) return productionDomain;

  const request = normalizeOrigin(requestOrigin);
  if (request) return request;

  throw new Error(
    "No public RVC model origin is configured. Set RVC_MODEL_PUBLIC_ORIGIN or REPLIT_DOMAINS.",
  );
}

function rvcModelStreamSignature(expiresAt: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for signed RVC model streaming");
  return createHmac("sha256", secret)
    .update(`${expiresAt}:${GRAVELKING_RVC_MODEL_KEY}:${GRAVELKING_RVC_INDEX_KEY}`)
    .digest("base64url");
}

export function buildSignedRvcModelStreamUrl(origin: string, ttlSec = 3600): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
  const signature = rvcModelStreamSignature(expiresAt);
  return `${origin.replace(/\/+$/, "")}/api/jax/rvc-model/${expiresAt}/${signature}/${GRAVELKING_RVC_MODEL_FILENAME}`;
}

export { rvcModelStreamSignature };