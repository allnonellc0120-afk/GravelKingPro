/**
 * POST /api/v1/lead-capture
 *
 * Enterprise B2B lead capture. Records the contact, issues a 7-day demo API
 * key, and sends the GravelKing Pro Technical Brief PDF to their inbox via
 * Resend. Falls back silently if Resend is not configured (key is still saved).
 */
import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { db, enterpriseLeadsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { logToolError } from "../lib/errorTracker";

const router = Router();

const VALID_ROLES = ["A&R", "Publisher", "Producer", "Platform Developer", "Other"] as const;

router.post("/v1/lead-capture", async (req: Request, res: Response): Promise<void> => {
  const { name, email, organization, role, verification_activity } = req.body as {
    name?: string;
    email?: string;
    organization?: string;
    role?: string;
    verification_activity?: unknown;
  };

  // ── Validate ──────────────────────────────────────────────────────────────
  const errors: string[] = [];
  if (!name?.trim()) errors.push("name is required");
  if (!email?.trim() || !email.includes("@")) errors.push("valid email is required");
  if (!organization?.trim()) errors.push("organization is required");
  if (!role?.trim()) errors.push("role is required");

  if (errors.length > 0) {
    res.status(400).json({ success: false, errors });
    return;
  }

  // ── Generate demo API key (7-day TTL) ─────────────────────────────────────
  const demoApiKey = randomBytes(32).toString("hex");
  const demoApiKeyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // ── Persist ───────────────────────────────────────────────────────────────
  let lead;
  try {
    [lead] = await db
      .insert(enterpriseLeadsTable)
      .values({
        name: name!.trim(),
        email: email!.trim().toLowerCase(),
        organization: organization!.trim(),
        role: (VALID_ROLES as readonly string[]).includes(role!.trim()) ? role!.trim() : "Other",
        demoApiKey,
        demoApiKeyExpiresAt,
        verificationActivity: verification_activity ? JSON.stringify(verification_activity) : null,
      })
      .returning();
  } catch (err) {
    // Duplicate email — still return the key
    logger.warn({ err, email }, "lead capture insert failed; may be duplicate");
    res.status(409).json({
      success: false,
      error: "An enterprise inquiry from this email already exists. Please check your inbox for the brief.",
    });
    return;
  }

  // ── Send email via Resend ─────────────────────────────────────────────────
  let emailSent = false;
  const resendKey = process.env["RESEND_API_KEY"]?.trim() ?? "";
  if (resendKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);

      const whitepaperUrl = "https://gravelkingpro.com/api/whitepaper.pdf";

      const { error } = await resend.emails.send({
        from: "GravelKing Pro <noreply@gravelkingpro.com>",
        to: email!.trim(),
        subject: "Your GravelKing Pro Technical Brief + Demo API Key",
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; background: #09090b; color: #fafafa; padding: 32px; border-radius: 8px; border: 1px solid #27272a;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
              <span style="color: #f59e0b; font-size: 20px;">⚡</span>
              <span style="font-weight: 700; font-size: 16px; letter-spacing: 0.05em; text-transform: uppercase;">GravelKing Productions</span>
            </div>
            <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">Your Enterprise Brief & Demo Key</h1>
            <p style="color: #a1a1aa; margin-bottom: 24px;">Hi ${name!.trim()}, thanks for your interest in GravelKing Pro MLK V3.5.</p>

            <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #a1a1aa; margin-bottom: 8px;">Your Demo API Key</p>
              <code style="font-family: monospace; font-size: 13px; color: #f59e0b; word-break: break-all;">${demoApiKey}</code>
              <p style="font-size: 11px; color: #71717a; margin-top: 8px;">Valid for 7 days · ${demoApiKeyExpiresAt.toUTCString()}</p>
            </div>

            <p style="color: #a1a1aa; margin-bottom: 16px;">Attached is our full technical brief covering the MLK V3.5 dual-anchor LSB steganography architecture, chain-of-custody certification, and enterprise integration guide.</p>

            <a href="${whitepaperUrl}"
               style="display: inline-block; background: #f59e0b; color: #000; font-weight: 600; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-bottom: 24px;">
              Download Technical Brief (PDF)
            </a>

            <p style="color: #a1a1aa; margin-bottom: 8px;">Try the live signal verification at:</p>
            <a href="https://gravelkingpro.com/verify" style="color: #f59e0b;">gravelkingpro.com/verify</a>

            <hr style="border: none; border-top: 1px solid #27272a; margin: 24px 0;" />
            <p style="font-size: 12px; color: #52525b;">GravelKing Productions · All N One LLC · <a href="mailto:kevm@gravelkingpro.com" style="color: #f59e0b;">kevm@gravelkingpro.com</a></p>
          </div>
        `,
      });

      if (!error) {
        emailSent = true;
        await db.update(enterpriseLeadsTable)
          .set({ emailSent: true })
          // @ts-ignore drizzle eq import
          .where((await import("drizzle-orm")).eq(enterpriseLeadsTable.id, lead.id));
      }
    } catch (err) {
      void logToolError("Lead Capture Email", "EMAIL_SEND", err);
      logger.warn({ err }, "lead capture email failed; lead was still saved");
    }
  }

  logger.info({ leadId: lead.id, email: lead.email, organization: lead.organization }, "enterprise lead captured");

  res.json({
    success: true,
    demoApiKey,
    demoApiKeyExpiresAt: demoApiKeyExpiresAt.toISOString(),
    emailSent,
    message: emailSent
      ? "Your demo key and technical brief have been sent to your inbox."
      : "Your demo key has been issued. The technical brief PDF is available at /api/whitepaper.pdf.",
  });
});

export default router;
