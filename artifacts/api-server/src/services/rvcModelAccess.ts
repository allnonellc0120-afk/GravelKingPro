import { createHmac } from "node:crypto";

export const GRAVELKING_RVC_MODEL_KEY = "models/gravelking_v2.pth";
export const GRAVELKING_RVC_INDEX_KEY = "models/gravelking_v2.index";
export const GRAVELKING_RVC_MODEL_FILENAME = "gravelking_v2.zip";

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