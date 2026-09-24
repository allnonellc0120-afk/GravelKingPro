import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db, analyticsEventsTable, artistProfilesTable, adminSettingsTable, creditTransactionsTable, toolErrorsTable, usersTable } from "@workspace/db";
import { requireLabelCatalogOwner, ADMIN_AUTOMATION_EMAIL } from "../lib/adminAuth";

const router = Router();
router.use("/admin/operations", (req, res, next) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

const STAGES = ["Landing", "Main Stage", "Recording / Duet", "Render / Master", "Vault Save", "Label Store / Contest Entry"] as const;
// Counts are distinct visitor journeys, not additive event totals. A visit can skip
// a stage; drop-off counts only visitors who reached a stage but not the next.
const stageSql = sql`CASE
  WHEN ${analyticsEventsTable.type} = 'pageview' AND ${analyticsEventsTable.path} IN ('/', '/home') THEN 0
  WHEN ${analyticsEventsTable.type} = 'pageview' AND (${analyticsEventsTable.path} LIKE '/duet%' OR ${analyticsEventsTable.path} LIKE '/stage/duet/%') THEN 2
  WHEN ${analyticsEventsTable.type} = 'pageview' AND (${analyticsEventsTable.path} LIKE '/main-stage%' OR ${analyticsEventsTable.path} LIKE '/stage/%') THEN 1
  WHEN ${analyticsEventsTable.type} = 'pageview' AND (${analyticsEventsTable.path} LIKE '/master%' OR ${analyticsEventsTable.path} LIKE '/studio%') THEN 3
  WHEN ${analyticsEventsTable.type} = 'pageview' AND (${analyticsEventsTable.path} LIKE '/vault%' OR ${analyticsEventsTable.path} LIKE '/library%') THEN 4
  WHEN ${analyticsEventsTable.type} = 'pageview' AND (${analyticsEventsTable.path} LIKE '/label%' OR ${analyticsEventsTable.path} LIKE '/contest%' OR ${analyticsEventsTable.path} LIKE '/submit%') THEN 5
  ELSE NULL END`;

router.get("/admin/operations/funnel", async (req: Request, res: Response) => {
  try {
    const days = Number(req.query.days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 90) return void res.status(400).json({ error: "days must be 1–90" });
    const since = new Date(Date.now() - days * 86400000);
    const activeSince = new Date(Date.now() - 15 * 60000);
    const [visits, active, errors] = await Promise.all([
      db.select({
        visitor: analyticsEventsTable.visitorId,
        stage: sql<number>`${stageSql}`.mapWith(Number),
      }).from(analyticsEventsTable)
        .where(and(gte(analyticsEventsTable.createdAt, since), eq(analyticsEventsTable.type, "pageview"),
          sql`${analyticsEventsTable.visitorId} IS NOT NULL`,
          sql`coalesce(${analyticsEventsTable.metadata}->>'internal','0') <> '1'`)),
      db.select({
        visitor: analyticsEventsTable.visitorId,
        device: sql<string>`coalesce(${analyticsEventsTable.metadata}->>'device', 'Unknown')`,
        at: analyticsEventsTable.createdAt,
      }).from(analyticsEventsTable)
        .where(and(gte(analyticsEventsTable.createdAt, activeSince), eq(analyticsEventsTable.type, "pageview"),
          sql`${analyticsEventsTable.visitorId} IS NOT NULL`,
          sql`coalesce(${analyticsEventsTable.metadata}->>'internal','0') <> '1'`))
        .orderBy(desc(analyticsEventsTable.createdAt)),
      db.select({ stage: toolErrorsTable.stage, tool: toolErrorsTable.toolName, count: sql<number>`count(*)`.mapWith(Number) })
        .from(toolErrorsTable).where(gte(toolErrorsTable.createdAt, since))
        .groupBy(toolErrorsTable.stage, toolErrorsTable.toolName),
    ]);
    const journeys = new Map<string, Set<number>>();
    for (const row of visits) {
      if (!row.visitor || row.stage === null || row.stage < 0 || row.stage >= STAGES.length) continue;
      if (!journeys.has(row.visitor)) journeys.set(row.visitor, new Set());
      journeys.get(row.visitor)!.add(row.stage);
    }
    const stages = STAGES.map((name, index) => {
      const reached = [...journeys.values()].filter(s => s.has(index)).length;
      const dropoff = index === STAGES.length - 1 ? null : [...journeys.values()].filter(s => s.has(index) && !s.has(index + 1)).length;
      return { name, reached, dropoff };
    });
    const devices: Record<string, number> = { iOS: 0, iPadOS: 0, Desktop: 0, "Other mobile": 0, Unknown: 0 };
    const latest = new Map<string, string>();
    for (const row of active) if (row.visitor && !latest.has(row.visitor)) latest.set(row.visitor, row.device);
    for (const device of latest.values()) devices[device in devices ? device : "Unknown"]++;
    const classify = (s: string): string => /vault|save|track/i.test(s) ? STAGES[4] :
      /contest|label|catalog/i.test(s) ? STAGES[5] : /duet|record|voice/i.test(s) ? STAGES[2] :
      /master|render|audio|split|stem/i.test(s) ? STAGES[3] : /stage/i.test(s) ? STAGES[1] : "Unmapped";
    res.json({ windowDays: days, generatedAt: new Date().toISOString(), methodology: "Distinct external visitor IDs observed in pageviews; a drop-off is a visitor who visited this stage but not the next during this window. Page visits are not recording, render, save, or entry success. Not a sequential conversion funnel. Active = visitor with pageview in last 15 minutes (not authenticated session); devices recorded for new pageviews only.", stages, active: { sessions: latest.size, devices }, errors: errors.map(e => ({ stage: classify(`${e.stage} ${e.tool}`), sourceStage: e.stage, tool: e.tool, count: e.count })) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Funnel query failed" }); }
});

router.get("/admin/operations/accounts", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? "").trim().slice(0, 120);
    if (q.length < 2) return void res.status(400).json({ error: "Search requires at least 2 characters" });
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    const users = await db.select({
      id: usersTable.id, email: usersTable.email, name: artistProfilesTable.artistName,
      creditsBalance: usersTable.creditsBalance, tier: usersTable.subscriptionTier, isPro: usersTable.isPro,
    }).from(usersTable).leftJoin(artistProfilesTable, eq(artistProfilesTable.userId, usersTable.id))
      .where(or(ilike(usersTable.email, `%${escaped}%`), ilike(artistProfilesTable.artistName, `%${escaped}%`), eq(usersTable.id, q)))
      .limit(30);
    const states = users.length ? await db.select().from(adminSettingsTable).where(sql`${adminSettingsTable.key} IN (${sql.join(users.map(u => sql`${`account.status.${u.id}`}`), sql`, `)})`) : [];
    const status = new Map(states.map(s => [s.key, s.value]));
    res.json({ users: users.map(u => ({ ...u, status: status.get(`account.status.${u.id}`) ?? "active" })) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Account search failed" }); }
});

router.get("/admin/operations/accounts/:id/ledger", async (req: Request, res: Response) => {
  try {
    const [user] = await db.select({ id: usersTable.id, creditsBalance: usersTable.creditsBalance }).from(usersTable).where(eq(usersTable.id, String(req.params.id)));
    if (!user) return void res.status(404).json({ error: "Account not found" });
    const [entries, audit] = await Promise.all([
      db.select().from(creditTransactionsTable).where(eq(creditTransactionsTable.userId, user.id)).orderBy(desc(creditTransactionsTable.createdAt)).limit(50),
      db.select({ value: adminSettingsTable.value }).from(adminSettingsTable)
        .where(sql`${adminSettingsTable.key} LIKE 'account.audit.%' AND (${adminSettingsTable.value}::jsonb->>'userId') = ${user.id}`)
        .orderBy(desc(adminSettingsTable.updatedAt)).limit(50),
    ]);
    res.json({ user, entries, audit: audit.map(row => JSON.parse(row.value)) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Ledger unavailable" }); }
});

router.post("/admin/operations/accounts/:id/override", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { action, amount, reason } = req.body ?? {};
  if (typeof reason !== "string" || reason.trim().length < 8 || reason.length > 500) return void res.status(400).json({ error: "Reason must be 8–500 characters" });
  const allowed = ["add", "deduct", "set", "tier", "freeze", "ban", "unfreeze", "reset"];
  if (!allowed.includes(action)) return void res.status(400).json({ error: "Invalid action" });
  if (["add", "deduct", "set"].includes(action) && (!Number.isSafeInteger(amount) || amount < (action === "set" ? 0 : 1) || amount > 1000000)) return void res.status(400).json({ error: "Credits must be a safe integer between 0 and 1,000,000" });
  if (action === "tier" && !["studio", "owner", "vip"].includes(req.body?.tier)) return void res.status(400).json({ error: "tier must be studio, owner, or vip" });
  if (id === req.dbUser?.id || req.body?.targetEmail === ADMIN_AUTOMATION_EMAIL) return void res.status(403).json({ error: "Owner account cannot be overridden here" });
  try {
    const result = await db.transaction(async tx => {
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, id)).for("update");
      if (!user) return null;
      if (user.email?.toLowerCase() === ADMIN_AUTOMATION_EMAIL) throw new Error("Owner account cannot be overridden here");
      const auditId = randomUUID();
      let balance = user.creditsBalance;
      if (["add", "deduct", "set"].includes(action)) {
        balance = action === "set" ? amount : action === "add" ? balance + amount : balance - amount;
        if (balance < 0 || balance > 2147483647) throw new Error("Insufficient balance or balance overflow");
        await tx.update(usersTable).set({ creditsBalance: balance }).where(eq(usersTable.id, id));
        await tx.insert(creditTransactionsTable).values({ userId: id, delta: balance - user.creditsBalance, kind: `admin_${action}`, reference: `admin:${auditId}` });
      } else if (action === "tier") {
        const tier = req.body.tier === "studio" ? "monthly" : "node_auditor";
        await tx.update(usersTable).set({ isPro: true, subscriptionTier: tier, isDeveloper: req.body.tier === "vip" }).where(eq(usersTable.id, id));
        await tx.insert(adminSettingsTable).values({ key: `account.tier.${id}`, value: req.body.tier }).onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: req.body.tier, updatedAt: new Date() } });
      } else {
        const state = action === "reset" || action === "unfreeze" ? "active" : action;
        await tx.insert(adminSettingsTable).values({ key: `account.status.${id}`, value: state }).onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: state, updatedAt: new Date() } });
      }
      await tx.insert(adminSettingsTable).values({ key: `account.audit.${auditId}`, value: JSON.stringify({ actorId: req.dbUser!.id, userId: id, action, amount: ["add", "deduct", "set"].includes(action) ? amount : undefined, tier: action === "tier" ? req.body.tier : undefined, reason: reason.trim(), at: new Date().toISOString() }) });
      return { balance, auditId };
    });
    if (!result) return void res.status(404).json({ error: "Account not found" });
    res.json({ ok: true, ...result });
  } catch (err) { res.status(409).json({ error: err instanceof Error ? err.message : "Override failed" }); }
});

export default router;