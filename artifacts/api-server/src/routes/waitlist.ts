import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, waitlistTable } from '@workspace/db';
import { asc, count, eq } from 'drizzle-orm';

const waitlistRouter = Router();

function checkAdminKey(req: Request, res: Response): boolean {
  const key = process.env.ADMIN_KEY?.trim() ?? '';
  if (!key) {
    res.status(503).json({ error: 'Admin key not configured on the server.' });
    return false;
  }
  if (req.headers['x-admin-key'] !== key) {
    res.status(403).json({ error: 'Forbidden.' });
    return false;
  }
  return true;
}

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
