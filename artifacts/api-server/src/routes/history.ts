import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { processRunsTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";

const historyRouter = Router();

historyRouter.get("/kernel/history", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.json({ runs: [] });
    return;
  }
  const runs = await db
    .select()
    .from(processRunsTable)
    .where(eq(processRunsTable.userId, req.dbUser.id))
    .orderBy(desc(processRunsTable.createdAt))
    .limit(20);
  res.json({ runs });
});

export default historyRouter;
