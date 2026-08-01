import { createHmac, timingSafeEqual } from "crypto";

// Downloads stop working this long after delivery (time-limited links).
export const DOWNLOAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Short-lived HMAC download token TTL — a secondary gate on top of the
// fulfillment_token, so a token leaked from logs/history expires quickly.
export const DOWNLOAD_TOKEN_TTL_MS = 60 * 60 * 1000;

function getDownloadSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for download tokens");
  return secret;
}

export function issueDownloadToken(sessionId: string, now: number = Date.now()): string {
  const exp = now + DOWNLOAD_TOKEN_TTL_MS;
  const sig = createHmac("sha256", getDownloadSecret())
    .update(`weekend-master:${sessionId}:${exp}`)
    .digest("hex");
  return `${exp}.${sig}`;
}

export function verifyDownloadToken(sessionId: string, token: string): boolean {
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!expRaw || !sig || !Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac("sha256", getDownloadSecret())
    .update(`weekend-master:${sessionId}:${exp}`)
    .digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function deliveryExpired(meta: Record<string, string | null | undefined>): boolean {
  const deliveredAt = meta.delivered_at ? Date.parse(meta.delivered_at) : NaN;
  // Fail closed: a delivered order with no parseable delivery date is expired.
  return !Number.isFinite(deliveredAt) || Date.now() - deliveredAt > DOWNLOAD_WINDOW_MS;
}
