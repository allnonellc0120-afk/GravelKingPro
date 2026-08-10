import * as oidc from "openid-client";
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recordAnalyticsEvent } from "../analytics";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
  DEMO_EMAIL,
  DEMO_PASSWORD_HASH,
  DEMO_USER_ID,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }
  // Reject backslashes and control chars: browsers normalize "/\evil.com" to
  // "//evil.com", turning a same-origin-looking path into an open redirect.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(value)) {
    return "/";
  }
  // Canonical check: resolve against a fixed origin and only accept values
  // that stay on that origin (catches "//evil.com" and encoded variants).
  try {
    const url = new URL(value, "https://internal.local");
    if (url.origin !== "https://internal.local") {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
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
      (error, result) => error ? reject(error) : resolve(result as Buffer),
    );
  });
  const expectedBytes = Buffer.from(expected, "base64url");
  return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes);
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
 * Owner accounts that always receive full lifetime access on sign-in, regardless
 * of Stripe state or which database (dev/prod) the server is connected to. Keyed
 * by verified OIDC email (lower-cased) so the grant survives an OIDC sub vs. legacy
 * UUID row mismatch. `node_auditor` is the top tier (a superset of every feature);
 * `isDeveloper` additionally unlocks the admin/label tooling.
 */
/**
 * Owner accounts that always receive full lifetime access on sign-in.
 */
const LIFETIME_GRANTS: Record<string, { tier: string; isDeveloper: boolean }> = {
  "allnonellc0120@gmail.com": { tier: "node_auditor", isDeveloper: true },
  "kymegky@gmail.com": { tier: "node_auditor", isDeveloper: false },
  "martypodany63@gmail.com": { tier: "node_auditor", isDeveloper: false },
};

/** Permanently banned emails — any OIDC login from these is rejected immediately. */
const BANNED_EMAILS = new Set(["hopelaborde66@gmail.com"]);

async function upsertUser(claims: Record<string, unknown>) {
  const sub = claims.sub as string;
  const rawEmail = (claims.email as string) || null;

  // Permanent ban enforcement — wipe existing row and reject login.
  const normalizedEmail = rawEmail?.toLowerCase().trim();
  if (normalizedEmail && BANNED_EMAILS.has(normalizedEmail)) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail));
    if (existing) {
      await db.delete(usersTable).where(eq(usersTable.id, existing.id));
    }
    throw new Error("Account permanently suspended.");
  }

  const grant = rawEmail
    ? LIFETIME_GRANTS[rawEmail.toLowerCase().trim()]
    : undefined;

  const profile = {
    email: rawEmail,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
    updatedAt: new Date(),
    // Owner allowlist: force full lifetime access (+admin for the developer email).
    // Non-allowlisted users keep whatever isPro/tier Stripe set — we never touch it.
    ...(grant
      ? { isPro: true, subscriptionTier: grant.tier, isDeveloper: grant.isDeveloper }
      : {}),
  };

  // 1) Row already keyed by this OIDC sub — update profile in place.
  const [bySub] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, sub));
  if (bySub) {
    const [user] = await db
      .update(usersTable)
      .set(profile)
      .where(eq(usersTable.id, sub))
      .returning();
    return user;
  }

  // 2) No sub-keyed row yet, but a row already exists for this email (e.g. created
  //    by grant-access or a legacy session). Adopt it rather than inserting a second
  //    row — `email` is UNIQUE, so a plain insert keyed by sub would throw. The
  //    returned id becomes the session id, so entitlement lookups stay consistent.
  if (rawEmail) {
    const [byEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, rawEmail));
    if (byEmail) {
      const [user] = await db
        .update(usersTable)
        .set(profile)
        .where(eq(usersTable.id, byEmail.id))
        .returning();
      return user;
    }
  }

  // 3) Brand-new user — insert keyed by the OIDC sub.
  const [user] = await db
    .insert(usersTable)
    .values({ id: sub, ...profile })
    .returning();
  return user;
}

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  // Fetch fresh isPro from DB so it reflects Stripe upgrades immediately
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: dbUser ? {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
        isPro: dbUser.isPro,
        subscriptionTier: dbUser.subscriptionTier ?? null,
        usedFreeSplit: dbUser.usedFreeSplit,
      } : null,
    }),
  );
});

router.post("/demo/login", async (req: Request, res: Response) => {
  if (demoRateLimited(req)) {
    res.status(429).json({ error: "Too many demo sign-in attempts. Try again later." });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
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

router.get("/auth/login", (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.query.returnTo ?? req.query.return_to);
  const redirectTo = new URL("/api/login", getOrigin(req));
  if (returnTo !== "/") {
    redirectTo.searchParams.set("returnTo", returnTo);
  }
  res.redirect(redirectTo.href);
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo ?? req.query.return_to);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  // Record signup completion event — best-effort, never block the redirect.
  const visitorId = (req.cookies as Record<string, string>)?.gk_vid ?? null;
  void recordAnalyticsEvent({
    type: "signup_completed",
    visitorId,
    sessionId: dbUser.id,
    path: "/callback",
    metadata: { returnTo },
  }).catch(() => {});

  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  await clearSession(res, sid);

  if (session?.user?.id === DEMO_USER_ID) {
    res.redirect(getSafeReturnTo(req.query.returnTo ?? req.query.return_to));
    return;
  }

  const config = await getOidcConfig();

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
