/**
 * Visitor email capture + admin bulk email.
 *
 * Public:
 *   POST /api/email-capture         — store a visitor's email, tied to their session user
 *   GET  /api/email-capture/status  — does the current visitor have an email on file?
 *
 * Admin:
 *   GET  /api/admin/email-list      — every captured address, newest first
 *   POST /api/admin/email-blast     — send one email to every captured address via Gmail (BCC batches)
 */
import { Router, type Request, type Response } from "express";
import { db, usersTable, emailCaptureTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin, isAdminAuthenticated } from "../lib/adminAuth";
import { rateLimit } from "../lib/rateLimiter";
import { getUsageUser } from "../lib/usage";
import { sendGmail, getGmailAddress } from "../lib/gmail";
import { storage } from "../storage";

const emailRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const captureRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  max: 10,
  message: "Too many attempts. Wait a few minutes and try again.",
});

/** POST /api/email-capture — store a visitor email (deduped), tied to their session user. */
emailRouter.post("/email-capture", captureRateLimit, async (req: Request, res: Response) => {
  const { email, source } = (req.body ?? {}) as { email?: string; source?: string };
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(normalized)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  try {
    // Tie the email to the visitor's user row so the free-tool gate recognises them.
    const usageUser = await getUsageUser(req, res);
    if (!usageUser.email?.trim()) {
      await db.update(usersTable).set({ email: normalized }).where(eq(usersTable.id, usageUser.id));
    }

    const [existing] = await db
      .select({ id: emailCaptureTable.id })
      .from(emailCaptureTable)
      .where(eq(emailCaptureTable.email, normalized))
      .limit(1);
    if (!existing) {
      await db.insert(emailCaptureTable).values({
        email: normalized,
        source: (source ?? "free-tools").slice(0, 50),
        referrer: typeof req.headers.referer === "string" ? req.headers.referer.slice(0, 500) : null,
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 500) : null,
      });
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/** GET /api/email-capture/status — does the current visitor have an email on file? */
emailRouter.get("/email-capture/status", async (req: Request, res: Response) => {
  try {
    // Admins are never gated.
    if (isAdminAuthenticated(req)) {
      res.json({ hasEmail: true });
      return;
    }
    if (req.isAuthenticated()) {
      const [u] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id));
      res.json({ hasEmail: Boolean(u?.email?.trim()) });
      return;
    }
    const sessionId = (req.cookies as Record<string, string>)?.gk_session;
    if (!sessionId) {
      res.json({ hasEmail: false });
      return;
    }
    const user = await storage.getUserBySession(sessionId);
    res.json({ hasEmail: Boolean(user?.email?.trim()) });
  } catch {
    res.json({ hasEmail: false });
  }
});

/** GET /api/admin/email-list — every captured address, newest first. */
emailRouter.get("/admin/email-list", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(emailCaptureTable)
      .orderBy(desc(emailCaptureTable.createdAt))
      .limit(1000);
    res.json({ ok: true, total: rows.length, emails: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

const BCC_BATCH = 40;

/**
 * POST /api/admin/email-blast — send one email to every captured address via
 * the owner's Gmail. Recipients are BCC'd in batches so addresses stay private.
 */
emailRouter.post("/admin/email-blast", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const { subject, body } = (req.body ?? {}) as { subject?: string; body?: string };
  if (!subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: "subject and body are required" });
    return;
  }
  try {
    const rows = await db.select({ email: emailCaptureTable.email }).from(emailCaptureTable);
    const emails = [...new Set(rows.map((r) => r.email))];
    if (emails.length === 0) {
      res.json({ ok: true, sent: 0, failed: 0, batches: 0, total: 0 });
      return;
    }

    // Gmail rejects "undisclosed-recipients" To headers via the API — send to
    // the owner's own address with all recipients in BCC instead.
    const sender = await getGmailAddress();
    if (!sender) {
      res.status(502).json({ error: "Could not reach your connected Gmail account. Try again in a moment." });
      return;
    }

    let sent = 0;
    let failed = 0;
    let batches = 0;
    for (let i = 0; i < emails.length; i += BCC_BATCH) {
      const chunk = emails.slice(i, i + BCC_BATCH);
      const ok = await sendGmail({
        to: sender,
        bcc: chunk.join(", "),
        subject: subject.trim(),
        text: body.trim(),
      });
      if (ok) sent += chunk.length; else failed += chunk.length;
      batches += 1;
      if (i + BCC_BATCH < emails.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    res.json({ ok: failed === 0, sent, failed, batches, total: emails.length });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default emailRouter;
