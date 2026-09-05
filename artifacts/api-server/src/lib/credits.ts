import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { db, creditTransactionsTable, type User, usersTable } from "@workspace/db";
import { storage } from "../storage";

export const CREDIT_COSTS = {
  song: 20,
  master: 75,
  certificate: 0,
} as const;

export const CREDIT_PACKS = [
  { id: "starter", name: "Starter", credits: 500, amountCents: 999, description: "500 credits for trying the workflow" },
  { id: "artist", name: "Artist", credits: 1250, amountCents: 1999, description: "1,250 credits for a release project" },
  { id: "studio", name: "Studio", credits: 2500, amountCents: 3499, description: "2,500 credits — less than a monthly plan" },
] as const;

// Subscription credits are a hard reset, not a rollover balance. The webhook
// resets the wallet to this exact amount at each paid billing renewal.
export const MONTHLY_CREDITS = {
  pro: 800,
  king: 2500,
} as const;

export type CreditSpendKind = "song" | "master" | "certificate";

export async function resolveCreditUser(req: Request): Promise<User | null> {
  if (req.dbUser) return req.dbUser;
  const sessionId = (req.cookies as Record<string, string>)?.gk_session;
  return sessionId ? storage.getUserBySession(sessionId) : null;
}

export async function getCreditsBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ creditsBalance: usersTable.creditsBalance })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return row?.creditsBalance ?? 0;
}

export async function getCreditTransactionHistory(userId: string, page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
  const rows = await db
    .select({
      id: creditTransactionsTable.id,
      delta: creditTransactionsTable.delta,
      kind: creditTransactionsTable.kind,
      reference: creditTransactionsTable.reference,
      createdAt: creditTransactionsTable.createdAt,
    })
    .from(creditTransactionsTable)
    .where(eq(creditTransactionsTable.userId, userId))
    .orderBy(desc(creditTransactionsTable.createdAt), desc(creditTransactionsTable.id))
    .limit(safePageSize + 1)
    .offset((safePage - 1) * safePageSize);
  const hasMore = rows.length > safePageSize;
  return {
    data: rows.slice(0, safePageSize),
    page: safePage,
    pageSize: safePageSize,
    hasMore,
  };
}

/**
 * Atomically spends credits only when the balance is sufficient, and records
 * the spend in the same transaction. A reference makes a retried request a
 * no-op instead of a second charge.
 */
export async function spendCredits(
  userId: string,
  amount: number,
  kind: CreditSpendKind,
  reference = `${kind}:${randomUUID()}`,
): Promise<{ ok: true; balance: number } | { ok: false; balance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Credit spend amount must be a positive integer.");
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ delta: creditTransactionsTable.delta })
      .from(creditTransactionsTable)
      .where(eq(creditTransactionsTable.reference, reference));
    if (existing.length > 0) {
      const [current] = await tx
        .select({ creditsBalance: usersTable.creditsBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      return { ok: true as const, balance: current?.creditsBalance ?? 0 };
    }

    const updated = await tx
      .update(usersTable)
      .set({ creditsBalance: sql`${usersTable.creditsBalance} - ${amount}` })
      .where(and(eq(usersTable.id, userId), gte(usersTable.creditsBalance, amount)))
      .returning({ creditsBalance: usersTable.creditsBalance });
    if (updated.length === 0) {
      const [current] = await tx
        .select({ creditsBalance: usersTable.creditsBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      return { ok: false as const, balance: current?.creditsBalance ?? 0 };
    }

    await tx.insert(creditTransactionsTable).values({
      userId,
      delta: -amount,
      kind: `spend_${kind}`,
      reference,
    });
    return { ok: true as const, balance: updated[0].creditsBalance };
  });
}

/**
 * Grants credits idempotently. Stripe payment intents and subscription
 * invoices use stable references, so duplicate webhook delivery is harmless.
 */
export async function grantCredits(
  userId: string,
  amount: number,
  kind: string,
  reference: string,
  stripePaymentIntentId?: string,
): Promise<{ granted: boolean; balance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Credit grant amount must be a positive integer.");
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditTransactionsTable)
      .values({
        userId,
        delta: amount,
        kind,
        reference,
        stripePaymentIntentId: stripePaymentIntentId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactionsTable.id });

    if (inserted.length === 0) {
      const [current] = await tx
        .select({ creditsBalance: usersTable.creditsBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      return { granted: false, balance: current?.creditsBalance ?? 0 };
    }

    const [updated] = await tx
      .update(usersTable)
      .set({ creditsBalance: sql`${usersTable.creditsBalance} + ${amount}` })
      .where(eq(usersTable.id, userId))
      .returning({ creditsBalance: usersTable.creditsBalance });
    return { granted: true, balance: updated?.creditsBalance ?? 0 };
  });
}

/** Replace a subscription wallet at renewal; unused credits never roll over. */
export async function resetCredits(
  userId: string,
  amount: number,
  kind: string,
  reference: string,
): Promise<{ reset: boolean; balance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Credit reset amount must be a positive integer.");
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditTransactionsTable)
      .values({ userId, delta: amount, kind, reference })
      .onConflictDoNothing()
      .returning({ id: creditTransactionsTable.id });
    if (inserted.length === 0) {
      const [current] = await tx.select({ creditsBalance: usersTable.creditsBalance }).from(usersTable).where(eq(usersTable.id, userId));
      return { reset: false, balance: current?.creditsBalance ?? 0 };
    }
    const [updated] = await tx
      .update(usersTable)
      .set({ creditsBalance: amount })
      .where(eq(usersTable.id, userId))
      .returning({ creditsBalance: usersTable.creditsBalance });
    return { reset: true, balance: updated?.creditsBalance ?? amount };
  });
}