import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { storage } from '../storage';
import { db, usersTable, promotersTable, referralAttributionsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { getStripePublishableKey, getUncachableStripeClient } from '../stripeClient';
import { ensureCustomerOnCurrentAccount } from '../lib/stripeCustomers';
import { recordAnalyticsEvent } from '../analytics';
import type Stripe from 'stripe';

const stripeRouter = Router();

const CHECKOUT_CATALOG = {
  "GravelKing Weekly": { plan: "pro", unitAmount: 999 },
  "GravelKing Studio": { plan: "king", unitAmount: 2499 },
  "Node Auditor": { plan: "node_auditor", unitAmount: 24950 },
} as const;

/** Never trust a client-selected tier or arbitrary product price. */
async function canonicalPlanForPrice(stripe: Stripe, priceId: string): Promise<"pro" | "king" | "node_auditor" | null> {
  const price = await stripe.prices.retrieve(priceId);
  // Legacy weekly prices remain active only so existing subscriptions continue
  // billing. They are never valid for a newly-created subscription.
  if (!price.active || price.currency !== "usd" || price.recurring?.interval !== "month") return null;
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  const product = await stripe.products.retrieve(productId);
  const approved = CHECKOUT_CATALOG[product.name as keyof typeof CHECKOUT_CATALOG];
  if (!approved || price.unit_amount !== approved.unitAmount) return null;
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
      candidate.recurring?.interval === "month"
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
            p.recurring?.interval === "month"
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

// Public Stripe.js configuration — publishable keys are safe for browser use.
stripeRouter.get('/stripe/config', async (_req: Request, res: Response) => {
  try {
    res.json({ publishableKey: await getStripePublishableKey() });
  } catch (err: unknown) {
    res.status(503).json({ error: err instanceof Error ? err.message : 'Stripe is unavailable.' });
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
    const metadata = { userId: dbUser.id, plan };
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

    void recordAnalyticsEvent({
      type: 'checkout_started',
      visitorId: (req.cookies as Record<string, string>)?.gk_vid ?? null,
      sessionId: dbUser.sessionId ?? dbUser.id,
      path: '/checkout',
      metadata: { priceId, plan, embedded: 'true' },
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
// Checkout). The non-/stripe paths are backwards-compatible aliases for
// already deployed clients.
stripeRouter.post('/stripe/create-subscription-intent', createSubscriptionIntent);
stripeRouter.post('/create-subscription-intent', createSubscriptionIntent);
stripeRouter.post('/payment-intent', createSubscriptionIntent);

// DEPRECATED: hosted Stripe Checkout is superseded by the embedded Payment
// Element flow (POST /api/stripe/create-subscription-intent). Kept only so
// older deployed clients don't break; new clients must not call this.
stripeRouter.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/stripe/create-subscription-intent>; rel="successor-version"');
  next();
});

// Create Stripe Checkout Session — requires OIDC authentication
stripeRouter.post('/checkout', async (req: Request, res: Response) => {
  try {
    // Auth required — trial eligibility is tracked per account
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
    // Self-heal customers minted on a previously connected Stripe account
    // (e.g. the dev sandbox before the live account was attached at publish
    // time) — their IDs don't exist on the current account and would fail
    // checkout forever for exactly the oldest accounts.
    const customerId = await ensureCustomerOnCurrentAccount(stripe, dbUser);

    const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? 'localhost:80';
    const baseUrl = `https://${domain}`;

    // One subscription per account — creating a second one would double-bill.
    const existingSubs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
    const blocking = existingSubs.data.find((s) => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status));
    if (blocking) {
      res.status(409).json({ error: 'You already have an active subscription. Manage it from your Account page.' });
      return;
    }

    // One OPEN checkout at a time — multiple open sessions created while the
    // trial is still unconsumed would each carry a free trial (trial farming).
    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 20 });
    await Promise.all(openSessions.data.map((s) => stripe.checkout.sessions.expire(s.id).catch(() => undefined)));

    // Trial days are plan-specific and available only once per account ever.
    // Do not mark it consumed here: an open/abandoned Stripe Checkout is not a trial.
    const price = await stripe.prices.retrieve(priceId);
    const plan = await canonicalPlanForPrice(stripe, priceId);
    if (!plan) {
      res.status(400).json({ error: "That price is not a GravelKing subscription plan." });
      return;
    }
    const trialDays = dbUser.trialUsed
      ? 0
      : plan === "king"
        ? 7
        : plan === "pro"
          ? 3
          : 0;

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

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      client_reference_id: dbUser.id,
      metadata: { userId: dbUser.id, plan, ...(referralCode && { referralCode }) },
      success_url: `${baseUrl}/pricing?checkout=success${plan ? `&plan=${encodeURIComponent(plan)}` : ''}`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      ...(trialDays > 0 && { subscription_data: { trial_period_days: trialDays } }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Funnel event — best-effort, must never block checkout
    const visitorId = (req.cookies as Record<string, string>)?.gk_vid ?? null;
    void recordAnalyticsEvent({
      type: 'checkout_started',
      visitorId,
      sessionId: dbUser.sessionId ?? dbUser.id,
      path: '/checkout',
      metadata: { priceId, plan },
    }).catch(() => { /* ignore analytics failures */ });

    res.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

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
