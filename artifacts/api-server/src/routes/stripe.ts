import { Router } from 'express';
import type { Request, Response } from 'express';
import { storage } from '../storage';
import { db, promotersTable, referralAttributionsTable, creditTransactionsTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { getStripePublishableKey, getUncachableStripeClient } from '../stripeClient';
import { ensureCustomerOnCurrentAccount } from '../lib/stripeCustomers';
import { recordAnalyticsEvent } from '../analytics';
import { logger } from '../lib/logger';
import {
  CREDIT_PACKS,
  getCreditsBalance,
  getCreditTransactionHistory,
  resolveCreditUser,
} from '../lib/credits';
import type Stripe from 'stripe';

const stripeRouter = Router();

type PendingCreditPurchase = {
  paymentIntentId: string;
  amountCents: number;
  credits: number;
  createdAt: string;
};

const SETTLING_PAYMENT_INTENT_STATUSES = new Set(["processing", "succeeded"]);

/**
 * Stripe is the source of truth for a payment that has been confirmed but
 * whose webhook grant has not reached the wallet ledger yet. Returning this
 * alongside history lets the client discard stale local pending state and
 * show the actual purchase amount and server timestamp.
 */
async function getPendingCreditPurchase(user: {
  id: string;
  stripeCustomerId: string | null;
}): Promise<PendingCreditPurchase | null> {
  if (!user.stripeCustomerId) return null;

  try {
    const stripe = await getUncachableStripeClient();
    const intents = await stripe.paymentIntents.list({
      customer: user.stripeCustomerId,
      limit: 100,
    });
    const creditIntents = intents.data.filter((intent) =>
      intent.metadata?.kind === "credits_purchase" &&
      intent.metadata.user_id === user.id &&
      SETTLING_PAYMENT_INTENT_STATUSES.has(intent.status),
    );
    if (creditIntents.length === 0) return null;

    const settledRows = await db
      .select({ paymentIntentId: creditTransactionsTable.stripePaymentIntentId })
      .from(creditTransactionsTable)
      .where(eq(creditTransactionsTable.userId, user.id));
    const settledPaymentIntentIds = new Set(
      settledRows
        .map((row) => row.paymentIntentId)
        .filter((paymentIntentId): paymentIntentId is string => Boolean(paymentIntentId)),
    );

    const pending = creditIntents
      .filter((intent) => !settledPaymentIntentIds.has(intent.id))
      .sort((a, b) => b.created - a.created || b.id.localeCompare(a.id))[0];
    if (!pending) return null;

    const credits = Number(pending.metadata?.credits);
    if (!Number.isInteger(credits) || credits <= 0 || !Number.isInteger(pending.amount) || pending.amount <= 0) {
      logger.warn(
        { userId: user.id, paymentIntentId: pending.id },
        "Ignoring credit payment with invalid settlement metadata",
      );
      return null;
    }

    return {
      paymentIntentId: pending.id,
      amountCents: pending.amount,
      credits,
      createdAt: new Date(pending.created * 1000).toISOString(),
    };
  } catch (err: unknown) {
    // A Stripe outage should not hide the ledger history. The next history
    // refresh will retry the server-side pending lookup.
    logger.warn(
      { userId: user.id, err },
      "Unable to load pending credit purchase from Stripe",
    );
    return null;
  }
}

const CHECKOUT_CATALOG = {
  "GravelKing Weekly": { plan: "pro", unitAmount: 999, interval: "month" },
  "GravelKing Studio": { plan: "king", unitAmount: 2499, interval: "month" },
  "Node Auditor": { plan: "node_auditor", unitAmount: 24950, interval: "month" },
} as const;

/** Never trust a client-selected tier or arbitrary product price. */
async function canonicalPlanForPrice(stripe: Stripe, priceId: string): Promise<"pro" | "king" | "node_auditor" | null> {
  const price = await stripe.prices.retrieve(priceId);
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  const product = await stripe.products.retrieve(productId);
  const approved = CHECKOUT_CATALOG[product.name as keyof typeof CHECKOUT_CATALOG];
  if (!approved || !price.active || price.currency !== "usd" ||
      price.recurring?.interval !== approved.interval ||
      price.unit_amount !== approved.unitAmount) return null;
  const sameNameProducts: Stripe.Product[] = [];
  for await (const candidate of stripe.products.search({
    query: `name:'${product.name}' AND active:'true'`,
    limit: 100,
  })) {
    sameNameProducts.push(candidate);
  }
  const canonicalProduct = sameNameProducts.sort(
    (a, b) => a.created - b.created || a.id.localeCompare(b.id),
  )[0];
  if (!canonicalProduct || canonicalProduct.id !== product.id) return null;

  const exactPrices: Stripe.Price[] = [];
  for await (const candidate of stripe.prices.list({
    product: canonicalProduct.id,
    active: true,
    limit: 100,
  })) {
    if (
      candidate.currency === "usd" &&
      candidate.unit_amount === approved.unitAmount &&
      candidate.recurring?.interval === approved.interval
    ) exactPrices.push(candidate);
  }
  const canonicalPrice = exactPrices.sort(
    (a, b) => a.created - b.created || a.id.localeCompare(b.id),
  )[0];
  if (!canonicalPrice || canonicalPrice.id !== price.id) return null;
  return approved.plan;
}

// List products with prices — calls Stripe API directly for reliability
stripeRouter.get('/stripe/products', async (_req: Request, res: Response) => {
  try {
    const stripe = await getUncachableStripeClient();
    const products: Stripe.Product[] = [];
    for await (const product of stripe.products.list({ active: true, limit: 100 })) {
      products.push(product);
    }
    const canonicalProducts = Object.keys(CHECKOUT_CATALOG)
      .map((name) => products
        .filter((product) => product.name === name)
        .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))[0])
      .filter((product): product is Stripe.Product => Boolean(product));
    const result = await Promise.all(
      canonicalProducts.map(async (product) => {
      const prices = await stripe.prices.list({ product: product.id, active: true });
      const approved = CHECKOUT_CATALOG[product.name as keyof typeof CHECKOUT_CATALOG];
      // Keep legacy Stripe objects untouched for existing subscribers, but
      // expose only the exact current catalog price to clients.
      const visiblePrices = approved
        ? prices.data.filter((p) =>
            p.currency === "usd" &&
            p.unit_amount === approved.unitAmount &&
            p.recurring?.interval === approved.interval
          ).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)).slice(0, 1)
        : [];
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata,
          prices: visiblePrices.map((p) => ({
            id: p.id,
            unit_amount: p.unit_amount,
            currency: p.currency,
            recurring: p.recurring,
          })),
        };
      })
    );
    const response: {
      data: typeof result;
      warning?: string;
    } = { data: result };

    if (result.length === 0) {
      response.warning =
        'No active Stripe products found. Run: pnpm --filter @workspace/scripts run seed-products';
    }

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

stripeRouter.get('/stripe/config', async (_req: Request, res: Response) => {
  try {
    res.json({ publishableKey: await getStripePublishableKey() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Stripe is unavailable.' });
  }
});

stripeRouter.get('/stripe/credit-packs', (_req: Request, res: Response) => {
  res.json({
    data: CREDIT_PACKS.map((pack) => ({
      ...pack,
      totalCredits: pack.credits + pack.bonusCredits,
    })),
  });
});

stripeRouter.get('/credits/balance', async (req: Request, res: Response) => {
  try {
    const user = await resolveCreditUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required', authRequired: true });
      return;
    }
    res.json({ creditsBalance: await getCreditsBalance(user.id), userId: user.id });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load credits.' });
  }
});

stripeRouter.get('/credits/purchase-status', async (req: Request, res: Response) => {
  const user = await resolveCreditUser(req);
  const paymentIntentId = typeof req.query.paymentIntentId === 'string' ? req.query.paymentIntentId : '';
  if (!user || !paymentIntentId) { res.status(400).json({ settled: false }); return; }
  const [grant] = await db.select({ id: creditTransactionsTable.id }).from(creditTransactionsTable)
    .where(and(eq(creditTransactionsTable.userId, user.id), eq(creditTransactionsTable.stripePaymentIntentId, paymentIntentId)));
  res.json({ settled: Boolean(grant) });
});

stripeRouter.get('/credits/history', async (req: Request, res: Response) => {
  try {
    const user = await resolveCreditUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required', authRequired: true });
      return;
    }
    const page = Number.parseInt(String(req.query.page ?? '1'), 10);
    const pageSize = Number.parseInt(String(req.query.pageSize ?? '10'), 10);
    const history = await getCreditTransactionHistory(
      user.id,
      Number.isFinite(page) ? page : 1,
      Number.isFinite(pageSize) ? pageSize : 10,
    );
    res.json({
      ...history,
      pendingPurchase: await getPendingCreditPurchase(user),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load credit history.' });
  }
});

stripeRouter.post('/stripe/create-credit-purchase-intent', async (req: Request, res: Response) => {
  try {
    const user = await resolveCreditUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required', authRequired: true });
      return;
    }
    const packId = typeof req.body?.packId === 'string' ? req.body.packId : '';
    const pack = CREDIT_PACKS.find((candidate) => candidate.id === packId);
    if (!pack) {
      res.status(400).json({ error: 'Select a valid credit pack.' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const customerId = await ensureCustomerOnCurrentAccount(stripe, user);
    const intent = await stripe.paymentIntents.create({
      amount: pack.amountCents,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: `${pack.name} credit pack — ${pack.credits} credits`,
      metadata: {
        kind: 'credits_purchase',
        user_id: user.id,
        pack_id: pack.id,
        credits: String(pack.credits + pack.bonusCredits),
        base_credits: String(pack.credits),
        bonus_credits: String(pack.bonusCredits),
      },
    });
    if (!intent.client_secret) {
      res.status(502).json({ error: 'Stripe did not return a payment secret.' });
      return;
    }
    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      intentType: 'payment',
      credits: pack.credits + pack.bonusCredits,
      baseCredits: pack.credits,
      bonusCredits: pack.bonusCredits,
      amountCents: pack.amountCents,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to start credit purchase.' });
  }
});

// Create an in-app Payment Element subscription. Trialing subscriptions use
// Stripe's pending SetupIntent because their first invoice is $0; paid
// subscriptions return the initial invoice PaymentIntent client secret.
const createSubscriptionIntent = async (req: Request, res: Response) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'Sign in required to subscribe', authRequired: true });
      return;
    }
    const { priceId } = req.body as { priceId?: string; plan?: string };
    if (!priceId) {
      res.status(400).json({ error: 'priceId is required' });
      return;
    }

    const dbUser = req.dbUser;
    const stripe = await getUncachableStripeClient();
    const customerId = await ensureCustomerOnCurrentAccount(stripe, dbUser);
    const existingSubs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
    const blocking = existingSubs.data.find((s) => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status));
    if (blocking) {
      res.status(409).json({ error: 'You already have an active subscription. Manage it from your Account page.' });
      return;
    }

    const price = await stripe.prices.retrieve(priceId);
    const plan = await canonicalPlanForPrice(stripe, priceId);
    if (!plan) {
      res.status(400).json({ error: "That price is not a GravelKing subscription plan." });
      return;
    }
    const trialDays = dbUser.trialUsed ? 0 : plan === "king" ? 7 : plan === "pro" ? 3 : 0;

    // Referral attribution — read the httpOnly gk_ref cookie (set server-side
    // on tracked-link clicks), validate the promoter, and record first-touch
    // attribution in our DB. Commission accrual happens only on the verified
    // invoice.paid webhook, never from client claims.
    let referralCode = '';
    const refCookie = (req.cookies as Record<string, string>)?.gk_ref;
    if (refCookie) {
      try {
        const [promoter] = await db
          .select()
          .from(promotersTable)
          .where(eq(promotersTable.code, refCookie.toUpperCase()));
        // Fraud basics: promoter must be approved and cannot refer themselves.
        if (promoter && promoter.status === 'approved' && promoter.userId !== dbUser.id) {
          await db
            .insert(referralAttributionsTable)
            .values({ userId: dbUser.id, promoterId: promoter.id })
            .onConflictDoNothing(); // first-touch wins
          referralCode = promoter.code;
        }
      } catch (refErr) {
        console.error('Referral attribution failed (non-blocking):', refErr);
      }
    }

    const metadata = { userId: dbUser.id, plan, ...(referralCode && { referralCode }) };
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: trialDays > 0 ? 'allow_incomplete' : 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata,
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent = invoice && typeof invoice !== 'string'
      ? ((invoice as unknown as { payment_intent?: Stripe.PaymentIntent | string | null }).payment_intent as Stripe.PaymentIntent | null)
      : null;
    const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | null;
    const clientSecret = paymentIntent?.client_secret ?? setupIntent?.client_secret;
    if (!clientSecret) {
      res.status(502).json({ error: 'Stripe did not return a payment authorization secret.' });
      return;
    }

    req.log?.info({
      userId: dbUser.id,
      plan,
      subscriptionId: subscription.id,
      customerId,
      intentType: paymentIntent ? "payment" : "setup",
      trialDays,
    }, "Stripe subscription checkout initiated");

    void recordAnalyticsEvent({
      type: 'checkout_started',
      visitorId: (req.cookies as Record<string, string>)?.gk_vid ?? null,
      sessionId: dbUser.sessionId ?? dbUser.id,
      path: '/checkout',
      metadata: { priceId, plan, embedded: 'true' },
    }).catch(() => {});
    void recordAnalyticsEvent({
      type: 'checkout_session_initiated',
      visitorId: (req.cookies as Record<string, string>)?.gk_vid ?? null,
      sessionId: dbUser.sessionId ?? dbUser.id,
      path: '/checkout',
      metadata: { plan, intentType: paymentIntent ? "payment" : "setup" },
    }).catch(() => {});

    res.json({
      clientSecret,
      intentType: paymentIntent ? 'payment' : 'setup',
      subscriptionId: subscription.id,
      trialing: trialDays > 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to start payment.';
    res.status(500).json({ error: message });
  }
};

// Canonical embedded-subscription endpoint (Payment Element + Express
// Checkout). The legacy hosted-Checkout endpoint and the pre-/stripe aliases
// were removed after analytics confirmed zero traffic from old clients.
stripeRouter.post('/stripe/create-subscription-intent', createSubscriptionIntent);

// Get subscription status for the current session cookie
stripeRouter.get('/subscription/status', async (req: Request, res: Response) => {
  try {
    // 1. Clerk-authenticated user — check their DB row directly.
    if (req.dbUser) {
      const status = await storage.getUserSubscriptionStatus(req.dbUser);
      const promoActive =
        req.dbUser.promoCode === "GKPRO7DAY" &&
        !!req.dbUser.promoExpiresAt &&
        req.dbUser.promoExpiresAt > new Date();
      if (promoActive) {
        res.json({ isPro: true, plan: "King", tier: "king", trialEligible: false, promoExpiresAt: req.dbUser.promoExpiresAt });
        return;
      }
      res.json({ ...status, trialEligible: !req.dbUser.trialUsed });
      return;
    }

    // 2. Anonymous gk_session cookie (legacy path).
      const sessionId = (req.cookies as Record<string, string>)?.gk_session;
    if (!sessionId) {
      res.json({ isPro: false, plan: null });
      return;
    }

    const user = await storage.getUserBySession(sessionId);
    if (!user) {
      res.json({ isPro: false, plan: null });
      return;
    }

    const status = await storage.getUserSubscriptionStatus(user);
    res.json({ ...status, trialEligible: !user.trialUsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Open Stripe Billing Portal — session-cookie based
stripeRouter.post('/stripe/portal', async (req: Request, res: Response) => {
  try {
    let user: Awaited<ReturnType<typeof storage.getUserBySession>> | null = null;

    if (req.dbUser) {
      user = req.dbUser;
    } else {
      const sessionId = (req.cookies as Record<string, string>)?.gk_session;
      if (sessionId) user = await storage.getUserBySession(sessionId);
    }

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found. Subscribe first.' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    // Derive return_url from server-side config only — never from req.headers.origin,
    // which an attacker-controlled page could set to their own domain.
    const appOrigin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ?? "localhost"}`;

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${appOrigin}/account`,
      });
      res.json({ url: portalSession.url });
    } catch (portalErr: unknown) {
      if ((portalErr as { code?: string })?.code === 'resource_missing') {
        // Customer was minted on a previously connected Stripe account.
        res.status(400).json({ error: 'No billing account found. Subscribe first.' });
        return;
      }
      throw portalErr;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default stripeRouter;
