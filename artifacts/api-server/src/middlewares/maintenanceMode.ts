import type { Request, Response, NextFunction } from "express";
import { db, adminSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isAdminAuthenticated } from "../lib/adminAuth";

const SETTING_KEY = "maintenance_mode";
const CACHE_MS = 5_000;

let cached: { value: boolean; expiresAt: number } | null = null;

export async function isMaintenanceModeOn(): Promise<boolean> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const [row] = await db
      .select({ value: adminSettingsTable.value })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, SETTING_KEY));
    const value = row?.value === "true";
    cached = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch {
    return false;
  }
}

export async function setMaintenanceMode(on: boolean): Promise<void> {
  await db
    .insert(adminSettingsTable)
    .values({ key: SETTING_KEY, value: on ? "true" : "false" })
    .onConflictDoUpdate({
      target: adminSettingsTable.key,
      set: { value: on ? "true" : "false", updatedAt: new Date() },
    });
  cached = { value: on, expiresAt: Date.now() + CACHE_MS };
}

/**
 * Kill switch middleware. When maintenance mode is on, every non-admin API
 * request gets a clean 503 instead of hitting real route logic. Admin routes
 * and health checks always pass through so the toggle itself stays reachable.
 */
export async function maintenanceModeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.path.startsWith("/api/admin") || req.path.startsWith("/api/healthz")) {
    next();
    return;
  }
  if (isAdminAuthenticated(req)) {
    next();
    return;
  }
  const on = await isMaintenanceModeOn();
  if (on) {
    res.status(503).json({
      success: false,
      error: "GravelKingPro is temporarily down for maintenance. Please check back shortly.",
      maintenance: true,
    });
    return;
  }
  next();
}
