import { Router, Request, Response } from "express";
import { createHash } from "node:crypto";
import { db, ipCertStubsTable, usersTable, type User } from "@workspace/db";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { generateForensicCertificate, certificateToPdf } from "../lib/forensicCertificate";
import { logToolError } from "../lib/errorTracker";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { resolveTier } from "../lib/entitlement";
import { checkCertUnlockQuota, consumeCertUnlock } from "../lib/certUnlocks";
import { getUncachableStripeClient } from "../stripeClient";
import { ensureCustomerOnCurrentAccount } from "../lib/stripeCustomers";
import { CREDIT_COSTS, getCreditsBalance, spendCredits, grantCredits } from "../lib/credits";

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

async function buildCertificate(stub: StubRow) {
  const nominator = createHash("sha256")
    .update(`${stub.contentHash}|${stub.artist}|${stub.certId}`)
    .digest("hex")
    .slice(0, 32);
  const certificate = generateForensicCertificate(
    {
      contentHash: stub.contentHash,
      stylePrompt: stub.stylePrompt ?? undefined,
    },
    {
      certId: stub.certId,
      nominator,
      denominator: stub.denominator,
      anchorA: 0,
      anchorB: 0,
    },
    {
      ipiNumber: stub.ipiNumber ?? undefined,
      iswc: stub.iswc ?? undefined,
      isrc: stub.isrc ?? undefined,
    },
    {
      // Legacy stubs (columns NULL) omit each field gracefully.
      generationModel: stub.generationModel ?? undefined,
      category: stub.category ?? undefined,
      provenance: stub.provenance ?? undefined,
      styleAuthorshipScore: stub.styleAuthorshipScore ?? undefined,
      copyrightScreen: stub.fingerprintStatus
        ? {
            status: stub.fingerprintStatus,
            provider: stub.fingerprintProvider ?? undefined,
            scope: stub.fingerprintStatus === "local_no_match"
              ? "local_catalog"
              : "global_commercial",
            scannedAt: stub.fingerprintScannedAt?.toISOString(),
          }
        : undefined,
    }
  );
  // A certificate stub stores its authoritative source hash in contentHash.
  // Pull the companion certificate when available so every document carries
  // both source inputs instead of rendering one of them as "N/A".
  const siblingRows = await db
    .select({ category: ipCertStubsTable.category, contentHash: ipCertStubsTable.contentHash })
    .from(ipCertStubsTable)
    .where(and(
      eq(ipCertStubsTable.ownerUserId, stub.ownerUserId!),
      eq(ipCertStubsTable.artist, stub.artist),
      inArray(ipCertStubsTable.category, ["lyrics", "full_track", "vocal_performance", "instrumental"]),
    ));
  const lyricSource = stub.category === "lyrics"
    ? stub
    : siblingRows.find((row) => row.category === "lyrics");
  const audioSource = stub.category === "lyrics"
    ? siblingRows.find((row) => row.category === "full_track")
      ?? siblingRows.find((row) => row.category === "vocal_performance")
      ?? siblingRows.find((row) => row.category === "instrumental")
    : stub;
  certificate.inputs.lyricsHash = lyricSource?.contentHash ?? null;
  certificate.inputs.rawPcmAudioHash = audioSource?.contentHash ?? null;
  // Override the chain-of-custody values to match the real stub exactly.
  certificate.chainOfCustody.nominator = nominator;
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
    const hasIncluded = tier === "king" || tier === "node_auditor" || user.isDeveloper;
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
      creditsBalance: await getCreditsBalance(user.id),
      creditCost: CREDIT_COSTS.certificate,
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
 * King, Node Auditor, and developer users have unlimited included unlocks.
 * Pro and Free users can always purchase one certificate for $1.99.
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
    const includedUnlock = tier === "king" || tier === "node_auditor" || user.isDeveloper;
    if (!includedUnlock) {
      res.status(402).json({
        success: false,
        code: "CERT_PURCHASE_REQUIRED",
        error: "Included unlocks are a King benefit. Unlock this certificate for $1.99, or upgrade to King.",
        priceCents: CERT_UNLOCK_PRICE_CENTS,
        checkoutUrl: `/api/court-cert/${certId}/checkout`,
      });
      return;
    }

    // Claim conditional on still-locked, then consume one included allowance.
    // The quota update itself is atomic against the current database row.
    const claimed = await db
      .update(ipCertStubsTable)
      .set({
        unlockedAt: sql`NOW()`,
        unlockSource: user.isDeveloper ? "admin" : "included",
      })
      .where(and(eq(ipCertStubsTable.certId, certId), isNull(ipCertStubsTable.unlockedAt)))
      .returning({ certId: ipCertStubsTable.certId });

    if (claimed.length === 0) {
      // Raced with another unlock — it's unlocked now either way.
      res.json({ success: true, unlocked: true, alreadyUnlocked: true });
      return;
    }

    const quota = await consumeCertUnlock(user);
    if (!quota.allowed) {
      // The claim must not survive an exhausted allowance. The conditional
      // predicate avoids clearing a claim that a separate request replaced.
      await db
        .update(ipCertStubsTable)
        .set({ unlockedAt: null, unlockSource: null })
        .where(and(
          eq(ipCertStubsTable.certId, certId),
          eq(ipCertStubsTable.unlockSource, "included"),
        ));
      res.status(402).json({
        success: false,
        code: "CERT_PURCHASE_REQUIRED",
        error: "Your included certificate allowance is exhausted. Unlock this certificate for $1.99, or try again after the allowance resets.",
        priceCents: CERT_UNLOCK_PRICE_CENTS,
        checkoutUrl: `/api/court-cert/${certId}/checkout`,
        includedUnlocks: { available: false, used: quota.used, limit: quota.limit, resetsAt: quota.resetsAt },
      });
      return;
    }

    res.json({
      success: true,
      unlocked: true,
      includedUnlocks: { available: true, used: quota.used, limit: quota.limit, resetsAt: quota.resetsAt },
    });
  } catch (err) {
    logger.error({ err, certId }, "cert unlock failed");
    void logToolError("Court Certificate", "CERT_UNLOCK", err);
    res.status(500).json({ success: false, error: "Failed to unlock certificate." });
  }
});

/**
 * POST /api/court-cert/:certId/payment-intent
 *
 * Embedded-checkout variant: returns a PaymentIntent client secret so the
 * buyer pays in-app (card / Apple Pay / Google Pay) instead of being
 * redirected to hosted Stripe Checkout. The unlock itself is still granted
 * only by the verified payment_intent.succeeded webhook — never here.
 */
router.post("/court-cert/:certId/payment-intent", async (req: Request, res: Response) => {
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
    const customerId = await ensureCustomerOnCurrentAccount(stripe, user);

    const intent = await stripe.paymentIntents.create({
      amount: CERT_UNLOCK_PRICE_CENTS,
      currency: "usd",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: `IP Certificate unlock — ${certId}`,
      metadata: { kind: "cert_unlock", cert_id: certId, user_id: user.id },
    });
    if (!intent.client_secret) {
      res.status(502).json({ success: false, error: "Stripe did not return a payment secret." });
      return;
    }

    res.json({ success: true, clientSecret: intent.client_secret });
  } catch (err) {
    logger.error({ err, certId }, "cert payment-intent failed");
    void logToolError("Court Certificate", "CERT_CHECKOUT", err);
    res.status(500).json({ success: false, error: "Failed to start certificate checkout." });
  }
});

/**
 * POST /api/court-cert/:certId/checkout
 *
 * $1.99 one-time Stripe Checkout that permanently unlocks ONE certificate.
 * The unlock itself is granted only by the verified webhook — never here.
 * DEPRECATED: hosted-checkout fallback kept for older app versions; the web
 * client uses /payment-intent above.
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
    // Self-heals customer IDs minted on a previously connected Stripe account.
    const customerId = await ensureCustomerOnCurrentAccount(stripe, user);

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
    const pdf = certificateToPdf(await buildCertificate(stub));
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
    res.json({ success: true, certificate: await buildCertificate(stub) });
  } catch (err) {
    logger.error({ err, certId }, "failed to generate court certificate");
    void logToolError("Court Certificate", "CERTIFICATE_GENERATION", err);
    res.status(500).json({ success: false, error: "Failed to generate court certificate." });
  }
});


export default router;
