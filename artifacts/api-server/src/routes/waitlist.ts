import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, waitlistTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const waitlistRouter = Router();

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
