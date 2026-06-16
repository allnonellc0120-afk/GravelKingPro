import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, waitlistTable } from '@workspace/db';
import { asc, count, eq } from 'drizzle-orm';
import { Resend } from 'resend';

const waitlistRouter = Router();

// Admin guard imported from shared lib (accepts httpOnly cookie or x-admin-key header).
import { requireAdmin as checkAdminKey } from '../lib/adminAuth';

waitlistRouter.get('/waitlist/admin', async (req: Request, res: Response) => {
  if (!checkAdminKey(req, res)) return;

  try {
    const [{ total }] = await db.select({ total: count() }).from(waitlistTable);
    const rows = await db
      .select({ id: waitlistTable.id, email: waitlistTable.email, createdAt: waitlistTable.createdAt })
      .from(waitlistTable)
      .orderBy(asc(waitlistTable.createdAt));

    if (req.query['format'] === 'csv') {
      const lines = ['id,email,signed_up_at'];
      for (const r of rows) {
        lines.push(`${r.id},"${r.email}",${r.createdAt.toISOString()}`);
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');
      res.send(lines.join('\n'));
      return;
    }

    res.json({ total, entries: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

waitlistRouter.post('/waitlist/admin/announce', async (req: Request, res: Response) => {
  if (!checkAdminKey(req, res)) return;

  const resendKey = process.env.RESEND_API_KEY?.trim() ?? '';
  if (!resendKey) {
    res.status(503).json({ error: 'RESEND_API_KEY is not configured on the server.' });
    return;
  }

  const { subject, body, fromName, fromEmail } = req.body as {
    subject?: string;
    body?: string;
    fromName?: string;
    fromEmail?: string;
  };

  if (!subject?.trim()) {
    res.status(400).json({ error: 'subject is required.' });
    return;
  }
  if (!body?.trim()) {
    res.status(400).json({ error: 'body is required.' });
    return;
  }

  const from = `${(fromName ?? 'GravelKing Pro').trim()} <${(fromEmail ?? 'noreply@gravelkingpro.com').trim()}>`;

  try {
    const rows = await db
      .select({ email: waitlistTable.email })
      .from(waitlistTable)
      .orderBy(asc(waitlistTable.createdAt));

    if (rows.length === 0) {
      res.json({ sent: 0, failed: 0 });
      return;
    }

    const resend = new Resend(resendKey);

    let sent = 0;
    let failed = 0;

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        slice.map((r) =>
          resend.emails.send({
            from,
            to: r.email,
            subject: subject.trim(),
            text: body.trim(),
          }),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) {
          sent++;
        } else {
          failed++;
        }
      }
    }

    res.json({ sent, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

waitlistRouter.post('/waitlist', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const normalised = email.trim().toLowerCase();

  try {
    const existing = await db
      .select()
      .from(waitlistTable)
      .where(eq(waitlistTable.email, normalised))
      .limit(1);

    if (existing.length > 0) {
      res.json({ success: true, alreadyRegistered: true });
      return;
    }

    await db.insert(waitlistTable).values({ email: normalised });
    res.json({ success: true, alreadyRegistered: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default waitlistRouter;
