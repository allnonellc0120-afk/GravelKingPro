import { Router, type Request, type Response } from "express";
import {
  setAdminCookie,
  clearAdminCookie,
  isAdminAuthenticated,
} from "../lib/adminAuth";

const adminAuthRouter = Router();

/** POST /api/admin/login — verify key, set httpOnly session cookie. */
adminAuthRouter.post("/admin/login", (req: Request, res: Response) => {
  const adminKey = process.env.ADMIN_KEY?.trim() ?? "";
  if (!adminKey) {
    res.status(503).json({ error: "Admin key not configured on the server." });
    return;
  }

  const { key } = (req.body ?? {}) as { key?: string };
  if (!key?.trim() || key.trim() !== adminKey) {
    res.status(403).json({ error: "Invalid admin key." });
    return;
  }

  setAdminCookie(res, adminKey);
  res.json({ ok: true });
});

/** GET /api/admin/check — return 200 if session is valid, 401 otherwise. */
adminAuthRouter.get("/admin/check", (req: Request, res: Response) => {
  if (isAdminAuthenticated(req)) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

/** POST /api/admin/logout — clear the session cookie. */
adminAuthRouter.post("/admin/logout", (_req: Request, res: Response) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

export default adminAuthRouter;
