/**
 * Shared admin authentication helpers.
 *
 * Strategy: derive a static HMAC-SHA256 token from ADMIN_KEY at login time
 * and store it in an httpOnly cookie. If ADMIN_KEY rotates every existing
 * cookie immediately becomes invalid (different expected token).
 *
 * Verification accepts EITHER the cookie (browser sessions) OR the
 * x-admin-key header (curl / scripted access) so both paths keep working.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const ADMIN_COOKIE = "gk_admin";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
const HMAC_DATA = "gk_admin_session_v1";

function computeToken(adminKey: string): string {
  return createHmac("sha256", adminKey).update(HMAC_DATA).digest("hex");
}

/** Set the signed httpOnly admin session cookie. */
export function setAdminCookie(res: Response, adminKey: string): void {
  res.cookie(ADMIN_COOKIE, computeToken(adminKey), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

/** Clear the admin session cookie. */
export function clearAdminCookie(res: Response): void {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
}

/** Returns true if the request carries a valid admin session (cookie or header) OR is an OIDC developer. */
export function isAdminAuthenticated(req: Request): boolean {
  const adminKey = process.env.ADMIN_KEY?.trim() ?? "";
  if (!adminKey) return false;

  // 1. Check httpOnly cookie (preferred — browser sessions after login).
  const cookie = (req.cookies as Record<string, string>)[ADMIN_COOKIE] ?? "";
  if (cookie) {
    const expected = computeToken(adminKey);
    try {
      if (
        cookie.length === expected.length &&
        timingSafeEqual(Buffer.from(cookie, "utf8"), Buffer.from(expected, "utf8"))
      ) {
        return true;
      }
    } catch {
      // length mismatch handled above; catch for safety
    }
  }

  // 2. Fall back to x-admin-key header (curl / scripted access).
  return req.headers["x-admin-key"] === adminKey;
}

/** Returns true if the request is from a Clerk-authenticated user with isDeveloper=true. */
export async function isDeveloperAuthenticated(req: Request): Promise<boolean> {
  return req.dbUser?.isDeveloper === true;
}

/**
 * Express guard: call at the top of an admin handler.
 * Returns true → proceed. Returns false → response already sent (403/503).
 * Accepts either admin cookie/header OR developer OIDC users.
 */
export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const adminKey = process.env.ADMIN_KEY?.trim() ?? "";
  if (!adminKey) {
    res.status(503).json({ error: "Admin key not configured on the server." });
    return false;
  }
  if (isAdminAuthenticated(req)) return true;
  if (await isDeveloperAuthenticated(req)) return true;
  res.status(403).json({ error: "Not authenticated." });
  return false;
}
