import { scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
  DEMO_EMAIL,
  DEMO_PASSWORD_HASH,
  DEMO_USER_ID,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

const demoAttempts = new Map<string, { count: number; resetAt: number }>();

async function verifyDemoPassword(password: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, expected] = DEMO_PASSWORD_HASH.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      Buffer.from(salt, "base64url"),
      64,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result as Buffer)),
    );
  });
  const expectedBytes = Buffer.from(expected, "base64url");
  return (
    derived.length === expectedBytes.length &&
    timingSafeEqual(derived, expectedBytes)
  );
}

function demoRateLimited(req: Request): boolean {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = demoAttempts.get(key);
  if (!current || current.resetAt <= now) {
    demoAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

/**
 * POST /api/demo/login
 * Special reviewer account for Google Play review. Creates a session-cookie
 * session that the auth middleware recognises as the demo user.
 */
router.post("/demo/login", async (req: Request, res: Response) => {
  if (demoRateLimited(req)) {
    res.status(429).json({ error: "Too many demo sign-in attempts. Try again later." });
    return;
  }

  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (email !== DEMO_EMAIL || !(await verifyDemoPassword(password))) {
    res.status(401).json({ error: "Invalid demo credentials." });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      firstName: "Google Play",
      lastName: "Reviewer",
      profileImageUrl: null,
    },
    access_token: "demo-review-session",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ ok: true });
});

export default router;
