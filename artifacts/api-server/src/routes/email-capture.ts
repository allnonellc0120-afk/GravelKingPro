/**
 * Visitor email capture + admin bulk email.
 *
 * Public:
 *   POST /api/email-capture         — store a visitor's email, tied to their session user
 *   GET  /api/email-capture/status  — does the current visitor have an email on file?
 *
 * Admin:
 *   GET  /api/admin/email-list      — every captured address, newest first
 *   POST /api/admin/email-blast/preview — stage a deduplicated recipient snapshot
 *   POST /api/admin/email-blast     — send one email to captured addresses via SendGrid or Gmail
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db, usersTable, emailCaptureTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAdmin, isAdminAuthenticated } from "../lib/adminAuth";
import { rateLimit } from "../lib/rateLimiter";
import { getUsageUser } from "../lib/usage";
import { sendGmail, getGmailAddress } from "../lib/gmail";
import { checkSendGrid, sendSendGrid } from "../lib/sendgrid";
import { ADMIN_AUTOMATION_EMAIL } from "../lib/adminAuth";
import { storage } from "../storage";

const emailRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}

/**
 * Attach an anonymous visitor's session to the canonical user for the email.
 * The session_id column is unique, so clear the anonymous row before moving
 * the token to an existing account.
 */
async function findOrLinkCapturedEmail(
  req: Request,
  usageUser: Awaited<ReturnType<typeof getUsageUser>>,
  normalized: string,
): Promise<void> {
  // getUsageUser creates the cookie on the response when this is a first-time
  // visitor, so req.cookies does not contain it yet. The returned user row does.
  const sessionId =
    (req.cookies as Record<string, string> | undefined)?.gk_session ??
    usageUser.sessionId ??
    undefined;
  const [emailOwner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalized))
    .limit(1);

  if (emailOwner && emailOwner.id !== usageUser.id) {
    if (!sessionId) return;
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ sessionId: null })
        .where(eq(usersTable.id, usageUser.id));
      await tx
        .update(usersTable)
        .set({ sessionId })
        .where(eq(usersTable.id, emailOwner.id));
    });
    return;
  }

  if (usageUser.email?.trim()) return;

  try {
    await db
      .update(usersTable)
      .set({ email: normalized })
      .where(eq(usersTable.id, usageUser.id));
  } catch (err) {
    // A concurrent request may have claimed the email after the lookup.
    // Re-resolve and link instead of returning a duplicate-key 500.
    if (!isUniqueViolation(err)) throw err;
    const [concurrentOwner] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalized))
      .limit(1);
    if (!concurrentOwner || !sessionId) throw err;
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ sessionId: null })
        .where(eq(usersTable.id, usageUser.id));
      await tx
        .update(usersTable)
        .set({ sessionId })
        .where(eq(usersTable.id, concurrentOwner.id));
    });
  }
}

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
    await findOrLinkCapturedEmail(req, usageUser, normalized);

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
    if (req.dbUser) {
      res.json({ hasEmail: Boolean(req.dbUser.email?.trim()) });
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
    const [capturedRows, registeredUsers] = await Promise.all([
      db
      .select()
      .from(emailCaptureTable)
      .orderBy(desc(emailCaptureTable.createdAt))
      .limit(1000),
      db
        .select({
          email: usersTable.email,
          createdAt: usersTable.createdAt,
          source: usersTable.id,
        })
        .from(usersTable),
    ]);
    const byEmail = new Map<string, typeof capturedRows[number]>();
    for (const row of capturedRows) byEmail.set(row.email, row);
    for (const user of registeredUsers) {
      const email = user.email?.trim().toLowerCase();
      if (email && !byEmail.has(email)) {
        byEmail.set(email, {
          id: 0,
          email,
          source: "registered-user",
          referrer: null,
          userAgent: null,
          ipHash: null,
          createdAt: user.createdAt,
        });
      }
    }
    const rows = [...byEmail.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json({ ok: true, total: rows.length, emails: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

/** GET /api/admin/email-provider — provider readiness for the outreach panel. */
emailRouter.get("/admin/email-provider", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const sendgrid = await checkSendGrid();
  let gmail = false;
  try {
    gmail = Boolean(await getGmailAddress());
  } catch {
    // Status is best-effort; the send path reports the actionable error.
  }
  res.json({ ok: true, sendgrid, gmail });
});

const BCC_BATCH = 40;
const SENDGRID_BATCH = 100;
const OUTREACH_PREVIEW_TTL_MS = 10 * 60_000;

type OutreachProvider = "sendgrid" | "gmail";

type OutreachPreview = {
  provider: OutreachProvider;
  emails: string[];
  createdAt: number;
};

const outreachPreviews = new Map<string, OutreachPreview>();

function normalizeProvider(provider: unknown): OutreachProvider {
  return provider === "gmail" ? "gmail" : "sendgrid";
}

function batchSizeFor(provider: OutreachProvider): number {
  return provider === "gmail" ? BCC_BATCH : SENDGRID_BATCH;
}

function batchCountFor(provider: OutreachProvider, recipientCount: number): number {
  return Math.ceil(recipientCount / batchSizeFor(provider));
}

async function getCapturedEmailSnapshot(): Promise<string[]> {
  const rows = await db.select({ email: emailCaptureTable.email }).from(emailCaptureTable);
  return [...new Set(rows.map((row) => row.email.trim().toLowerCase()))];
}

function removeExpiredOutreachPreviews(now = Date.now()): void {
  for (const [id, preview] of outreachPreviews) {
    if (now - preview.createdAt > OUTREACH_PREVIEW_TTL_MS) outreachPreviews.delete(id);
  }
}

function storeOutreachPreview(provider: OutreachProvider, emails: string[]): string {
  const now = Date.now();
  removeExpiredOutreachPreviews(now);
  // Keep the in-memory store bounded if an admin leaves several composer tabs open.
  while (outreachPreviews.size >= 100) {
    const oldest = outreachPreviews.keys().next().value;
    if (!oldest) break;
    outreachPreviews.delete(oldest);
  }
  const id = randomUUID();
  outreachPreviews.set(id, { provider, emails, createdAt: now });
  return id;
}

function getOutreachPreview(id: string): OutreachPreview | null {
  removeExpiredOutreachPreviews();
  return outreachPreviews.get(id) ?? null;
}

/** POST /api/admin/email-blast/preview — stage the exact audience for a send. */
emailRouter.post("/admin/email-blast/preview", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const selectedProvider = normalizeProvider((req.body ?? {}).provider);
  try {
    const emails = await getCapturedEmailSnapshot();
    const previewId = storeOutreachPreview(selectedProvider, emails);
    res.json({
      ok: true,
      previewId,
      provider: selectedProvider,
      total: emails.length,
      recipientCount: emails.length,
      batches: batchCountFor(selectedProvider, emails.length),
      emails,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to preview recipients" });
  }
});

/**
 * POST /api/admin/email-blast — send one email to every captured address via
 * SendGrid or the explicitly selected Gmail fallback.
 */
emailRouter.post("/admin/email-blast", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const { subject, body, provider, recipients, previewId } = (req.body ?? {}) as {
    subject?: string;
    body?: string;
    provider?: string;
    recipients?: unknown;
    previewId?: unknown;
  };
  if (!subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: "subject and body are required" });
    return;
  }
  if (recipients !== undefined && (
    !Array.isArray(recipients)
    || recipients.some((email): email is string => typeof email !== "string" || !EMAIL_RE.test(email.trim()))
  )) {
    res.status(400).json({ error: "recipients must be a list of valid email addresses" });
    return;
  }
  const selectedProvider = normalizeProvider(provider);
  if (previewId !== undefined && typeof previewId !== "string") {
    res.status(400).json({ error: "previewId must be a string" });
    return;
  }
  if (previewId !== undefined && recipients !== undefined) {
    res.status(400).json({ error: "previewId and recipients cannot be used together" });
    return;
  }
  if (recipients === undefined && previewId === undefined) {
    res.status(400).json({ error: "Preview the recipient list before sending" });
    return;
  }
  try {
    // Retry requests must be limited to addresses that are still in the
    // captured audience. The UI supplies only the failedRecipients returned
    // by an earlier send; this server-side check also prevents arbitrary
    // addresses from being introduced through the retry payload.
    let emails: string[];
    if (previewId !== undefined) {
      const preview = getOutreachPreview(previewId);
      if (!preview) {
        res.status(409).json({ error: "Recipient preview expired or is no longer available. Preview the list again." });
        return;
      }
      if (preview.provider !== selectedProvider) {
        res.status(409).json({ error: "The selected provider changed. Preview the recipient list again." });
        return;
      }
      outreachPreviews.delete(previewId);
      emails = preview.emails;
    } else {
      const capturedEmails = new Set(await getCapturedEmailSnapshot());
      emails = recipients === undefined
        ? [...capturedEmails]
        : [...new Set(
          recipients
            .map((email) => email.trim().toLowerCase())
            .filter((email) => capturedEmails.has(email)),
        )];
    }
    if (emails.length === 0) {
      res.json({ ok: true, sent: 0, failed: 0, failedRecipients: [], batches: 0, total: 0 });
      return;
    }

    if (selectedProvider === "sendgrid") {
      const sender = process.env.SENDGRID_FROM_EMAIL?.trim() || ADMIN_AUTOMATION_EMAIL;
      let sent = 0;
      let failed = 0;
      const failedRecipients: string[] = [];
      let batches = 0;
      for (let i = 0; i < emails.length; i += SENDGRID_BATCH) {
        const chunk = emails.slice(i, i + SENDGRID_BATCH);
        const ok = await sendSendGrid({
          to: chunk,
          from: sender,
          subject: subject.trim(),
          text: body.trim(),
        });
        if (ok) {
          sent += chunk.length;
        } else {
          failed += chunk.length;
          failedRecipients.push(...chunk);
        }
        batches += 1;
        if (i + SENDGRID_BATCH < emails.length) await new Promise((r) => setTimeout(r, 300));
      }
      res.json({
        ok: failed === 0,
        provider: selectedProvider,
        sent,
        failed,
        failedRecipients,
        batches,
        total: emails.length,
      });
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
    const failedRecipients: string[] = [];
    let batches = 0;
    for (let i = 0; i < emails.length; i += BCC_BATCH) {
      const chunk = emails.slice(i, i + BCC_BATCH);
      const ok = await sendGmail({
        to: sender,
        bcc: chunk.join(", "),
        subject: subject.trim(),
        text: body.trim(),
      });
      if (ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        failedRecipients.push(...chunk);
      }
      batches += 1;
      if (i + BCC_BATCH < emails.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    res.json({
      ok: failed === 0,
      provider: selectedProvider,
      sent,
      failed,
      failedRecipients,
      batches,
      total: emails.length,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default emailRouter;
