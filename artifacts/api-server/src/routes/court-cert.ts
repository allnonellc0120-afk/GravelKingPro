import { Router, Request, Response } from "express";
import { db, ipCertStubsTable, usersTable, type User } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { generateForensicCertificate, certificateToPdf } from "../lib/forensicCertificate";
import { logToolError } from "../lib/errorTracker";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { resolveTier } from "../lib/entitlement";
import { checkCertUnlockQuota, consumeCertUnlock } from "../lib/certUnlocks";
import { getUncachableStripeClient } from "../stripeClient";

const router = Router();

/** One-time, permanent per-certificate unlock price (USD cents). */
export const CERT_UNLOCK_PRICE_CENTS = 199;

/**
 * Resolve the calling user without creating one. Certificate documents are
 * owner-only, so an unauthenticated caller gets nothing — we never mint a
 * fresh anonymous session row here.
 */
async function resolveCertUser(req: Request): Promise<User | null> {
  if (req.dbUser) return req.dbUser;
  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  if (!sessionId) return null;
  return storage.getUserBySession(sessionId);
}

type StubRow = typeof ipCertStubsTable.$inferSelect;

/**
 * Owner + entitlement gate for certificate documents.
 * Fail-closed rules:
 *   - no resolved user             → 401
 *   - stub has no recorded owner   → 403 (legacy stubs never leak; developers exempt)
 *   - caller is not the owner      → 404 (don't confirm the cert exists to non-owners)
 *   - owned but not unlocked       → 402 with unlock options
 */
async function gateCertDocument(
  req: Request,
  res: Response,
  certId: string,
): Promise<StubRow | null> {
  const [stub] = await db.select().from(ipCertStubsTable).where(eq(ipCertStubsTable.certId, certId));
  if (!stub) {
    res.status(404).json({ success: false, error: "Certificate not found." });
    return null;
  }

  const user = await resolveCertUser(req);
  if (!user) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      error: "Sign in on the device that created this certificate to view it.",
    });
    return null;
  }

  const isOwner = stub.ownerUserId !== null && stub.ownerUserId === user.id;
  if (!isOwner && !user.isDeveloper) {
    // Same body as "not found" — non-owners can't probe which certIds exist.
    res.status(404).json({ success: false, error: "Certificate not found." });
    return null;
  }

  if (!stub.unlockedAt && !user.isDeveloper) {
    res.status(402).json({
      success: false,
      code: "CERT_LOCKED",
      certId: stub.certId,
      error: "This certificate document is locked. Unlock it to view or download.",
      priceCents: CERT_UNLOCK_PRICE_CENTS,
      unlock: {
        purchase: `/api/court-cert/${stub.certId}/checkout`,
        included: `/api/court-cert/${stub.certId}/unlock`,
      },
    });
    return null;
  }

  return stub;
}

function buildCertificate(stub: StubRow) {
  const certificate = generateForensicCertificate(
    {
      contentHash: stub.contentHash,
      stylePrompt: stub.stylePrompt ?? undefined,
    },
    {
      certId: stub.certId,
      nominator: stub.denominator.slice(0, 32), // reconstruct from stub for cert display
      denominator: stub.denominator,
      anchorA: 0,
      anchorB: 0,
    },
    {
      ipiNumber: stub.ipiNumber ?? undefined,
      iswc: stub.iswc ?? undefined,
      isrc: stub.isrc ?? undefined,
    }
  );
  // Override the chain-of-custody values to match the real stub exactly.
  certificate.chainOfCustody.nominator = stub.denominator.slice(0, 32);
  certificate.chainOfCustody.denominator = stub.denominator;
  certificate.chainOfCustody.handshake = stub.handshake;
  return certificate;
}

/**
 * GET /api/court-cert/example
 *
 * The ONLY certificate document served without auth — a clearly-labelled,
 * fabricated sample for public/marketing pages. Contains no real cert data.
 */
router.get("/court-cert/example", (_req: Request, res: Response) => {
  try {
    const certificate = generateForensicCertificate(
      {
        contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        stylePrompt: "EXAMPLE — outlaw grunge at 98 BPM in E minor, acoustic intro, distorted chorus",
      },
      {
        certId: "00000000-0000-0000-0000-000000000000",
        nominator: "0".repeat(32),
        denominator: "0".repeat(32),
        anchorA: 0,
        anchorB: 0,
      },
      {}
    );
    certificate.chainOfCustody.handshake = "0".repeat(64);
    res.json({
      success: true,
      example: true,
      notice: "This is a generic EXAMPLE certificate for illustration only. Real certificates are private to their owner and require an unlock.",
      certificate,
    });
  } catch (err) {
    logger.error({ err }, "failed to generate example certificate");
    res.status(500).json({ success: false, error: "Failed to generate example certificate." });
  }
});

/**
 * GET /api/court-cert/:certId/status
 *
 * Owner-only lock status + unlock options (never leaks cert content).
 */
router.get("/court-cert/:certId/status", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const user = await resolveCertUser(req);
    if (!user) {
      res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: "Sign in required." });
      return;
    }
    const [stub] = await db.select().from(ipCertStubsTable).where(eq(ipCertStubsTable.certId, certId));
    if (!stub || (stub.ownerUserId !== user.id && !user.isDeveloper)) {
      res.status(404).json({ success: false, error: "Certificate not found." });
      return;
    }

    const tier = await resolveTier(req);
    const hasIncluded = tier === "monthly" || tier === "node_auditor";
    const quota = hasIncluded ? checkCertUnlockQuota(user) : null;

    res.json({
      success: true,
      certId: stub.certId,
      unlocked: !!stub.unlockedAt || !!user.isDeveloper,
      unlockedAt: stub.unlockedAt ?? null,
      unlockSource: stub.unlockSource ?? null,
      category: stub.category ?? null,
      provenance: stub.provenance ?? null,
      priceCents: CERT_UNLOCK_PRICE_CENTS,
      includedUnlocks: quota
        ? { available: quota.allowed, used: quota.used, limit: quota.limit, resetsAt: quota.resetsAt }
        : null,
    });
  } catch (err) {
    logger.error({ err, certId }, "cert status failed");
    res.status(500).json({ success: false, error: "Failed to load certificate status." });
  }
});

/**
 * POST /api/court-cert/:certId/unlock
 *
 * Consume ONE included unlock (monthly/Studio and node_auditor subscribers,
 * 20 per rolling 30 days). Weekly/free users are directed to the $1.99
 * one-time purchase instead — the allowance is a monthly+ benefit only.
 */
router.post("/court-cert/:certId/unlock", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const user = await resolveCertUser(req);
    if (!user) {
      res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: "Sign in required." });
      return;
    }
    const [stub] = await db.select().from(ipCertStubsTable).where(eq(ipCertStubsTable.certId, certId));
    if (!stub || (stub.ownerUserId !== user.id && !user.isDeveloper)) {
      res.status(404).json({ success: false, error: "Certificate not found." });
      return;
    }
    if (stub.unlockedAt) {
      res.json({ success: true, unlocked: true, alreadyUnlocked: true });
      return;
    }

    const tier = await resolveTier(req);
    if (tier !== "monthly" && tier !== "node_auditor" && !user.isDeveloper) {
      res.status(402).json({
        success: false,
        code: "CERT_PURCHASE_REQUIRED",
        error: "Included unlocks are a Studio benefit. Unlock this certificate for $1.99, or upgrade to Studio.",
        priceCents: CERT_UNLOCK_PRICE_CENTS,
        checkoutUrl: `/api/court-cert/${certId}/checkout`,
      });
      return;
    }

    // Claim the unlock first (conditional on still-locked), then consume the
    // allowance. If the allowance is exhausted, release the claim — this
    // ordering means a duplicate concurrent unlock can never double-consume.
    const claimed = await db
      .update(ipCertStubsTable)
      .set({ unlockedAt: sql`NOW()`, unlockSource: user.isDeveloper ? "admin" : "included" })
      .where(and(eq(ipCertStubsTable.certId, certId), isNull(ipCertStubsTable.unlockedAt)))
      .returning({ certId: ipCertStubsTable.certId });

    if (claimed.length === 0) {
      // Raced with another unlock — it's unlocked now either way.
      res.json({ success: true, unlocked: true, alreadyUnlocked: true });
      return;
    }

    const quota = await consumeCertUnlock(user);
    if (!quota.allowed) {
      // Roll the claim back — allowance exhausted.
      await db
        .update(ipCertStubsTable)
        .set({ unlockedAt: null, unlockSource: null })
        .where(and(eq(ipCertStubsTable.certId, certId), eq(ipCertStubsTable.unlockSource, "included")));
      res.status(429).json({
        success: false,
        code: "CERT_UNLOCK_LIMIT_REACHED",
        error: `You've used all ${quota.limit} included certificate unlocks for this 30-day period. You can still unlock this certificate for $1.99.`,
        used: quota.used,
        limit: quota.limit,
        resetsAt: quota.resetsAt,
        priceCents: CERT_UNLOCK_PRICE_CENTS,
        checkoutUrl: `/api/court-cert/${certId}/checkout`,
      });
      return;
    }

    res.json({
      success: true,
      unlocked: true,
      includedUnlocks: { used: quota.used, limit: quota.limit, resetsAt: quota.resetsAt },
    });
  } catch (err) {
    logger.error({ err, certId }, "cert unlock failed");
    void logToolError("Court Certificate", "CERT_UNLOCK", err);
    res.status(500).json({ success: false, error: "Failed to unlock certificate." });
  }
});

/**
 * POST /api/court-cert/:certId/checkout
 *
 * $1.99 one-time Stripe Checkout that permanently unlocks ONE certificate.
 * The unlock itself is granted only by the verified webhook — never here.
 */
router.post("/court-cert/:certId/checkout", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const user = await resolveCertUser(req);
    if (!user) {
      res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: "Sign in required." });
      return;
    }
    const [stub] = await db.select().from(ipCertStubsTable).where(eq(ipCertStubsTable.certId, certId));
    if (!stub || stub.ownerUserId !== user.id) {
      res.status(404).json({ success: false, error: "Certificate not found." });
      return;
    }
    if (stub.unlockedAt) {
      res.json({ success: true, alreadyUnlocked: true });
      return;
    }

    const stripe = await getUncachableStripeClient();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId: user.id },
      });
      await storage.linkStripeCustomer(user.id, customer.id);
      customerId = customer.id;
    }

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:80";
    const baseUrl = `https://${domain}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: CERT_UNLOCK_PRICE_CENTS,
            product_data: {
              name: "IP Certificate Unlock",
              description: `Permanent unlock of forensic certificate ${certId}`,
            },
          },
        },
      ],
      client_reference_id: user.id,
      metadata: { kind: "cert_unlock", cert_id: certId, user_id: user.id },
      success_url: `${baseUrl}/mastering?certUnlock=success&certId=${encodeURIComponent(certId)}`,
      cancel_url: `${baseUrl}/mastering?certUnlock=cancelled&certId=${encodeURIComponent(certId)}`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    logger.error({ err, certId }, "cert checkout failed");
    void logToolError("Court Certificate", "CERT_CHECKOUT", err);
    res.status(500).json({ success: false, error: "Failed to start certificate checkout." });
  }
});

/**
 * GET /api/court-cert/:certId.pdf
 *
 * PDF rendering — same owner + unlock gate as the JSON document.
 */
router.get("/court-cert/:certId.pdf", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const stub = await gateCertDocument(req, res, certId);
    if (!stub) return;
    const pdf = certificateToPdf(buildCertificate(stub));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gravelking-cert-${certId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logger.error({ err, certId }, "failed to generate court certificate PDF");
    void logToolError("Court Certificate PDF", "CERTIFICATE_GENERATION", err);
    res.status(500).json({ success: false, error: "Failed to generate court certificate PDF." });
  }
});

/**
 * GET /api/court-cert/:certId
 *
 * Court-admissible forensic certificate (JSON) — OWNER-ONLY and only after
 * the certificate has been unlocked (purchase or included allowance).
 */
router.get("/court-cert/:certId", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const stub = await gateCertDocument(req, res, certId);
    if (!stub) return;
    res.json({ success: true, certificate: buildCertificate(stub) });
  } catch (err) {
    logger.error({ err, certId }, "failed to generate court certificate");
    void logToolError("Court Certificate", "CERTIFICATE_GENERATION", err);
    res.status(500).json({ success: false, error: "Failed to generate court certificate." });
  }
});


export default router;
