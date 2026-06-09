import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { storage } from '../storage';
import { getUncachableStripeClient } from '../stripeClient';
import { recordAnalyticsEvent } from '../analytics';
import type Stripe from 'stripe';

const stripeRouter = Router();

// List products with prices — calls Stripe API directly for reliability
stripeRouter.get('/stripe/products', async (_req: Request, res: Response) => {
  try {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active: true, limit: 20 });
    const result = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({ product: product.id, active: true });
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata,
          prices: prices.data.map((p) => ({
            id: p.id,
            unit_amount: p.unit_amount,
            currency: p.currency,
            recurring: p.recurring,
          })),
        };
      })
    );
    res.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Create Stripe Checkout Session — session-cookie based, no auth required
stripeRouter.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { priceId } = req.body as { priceId?: string };

    if (!priceId) {
      res.status(400).json({ error: 'priceId is required' });
      return;
    }

    const sessionId: string = (req.cookies as Record<string, string>)?.gk_session ?? randomUUID();
    const user = await storage.getOrCreateUser(sessionId);

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.create({
        metadata: { userId: user.id },
      });
      await storage.linkStripeCustomer(user.id, customer.id);
      customerId = customer.id;
    }

    const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? 'localhost:80';
    const baseUrl = `https://${domain}`;

    const stripe = await getUncachableStripeClient();

    // Grant a 3-day trial on monthly subscriptions
    const price = await stripe.prices.retrieve(priceId);
    const isMonthly = price.recurring?.interval === 'month';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      ...(isMonthly && { subscription_data: { trial_period_days: 3 } }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Funnel event — best-effort, must never block checkout.
    const visitorId = (req.cookies as Record<string, string>)?.gk_vid ?? null;
    void recordAnalyticsEvent({
      type: 'checkout_started',
      visitorId,
      sessionId: user.sessionId ?? user.id,
      path: '/checkout',
      metadata: { priceId },
    }).catch(() => { /* ignore analytics failures */ });

    res.cookie('gk_session', user.sessionId ?? user.id, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get subscription status for the current session cookie
stripeRouter.get('/subscription/status', async (req: Request, res: Response) => {
  try {
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
    res.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Open Stripe Billing Portal — session-cookie based
stripeRouter.post('/stripe/portal', async (req: Request, res: Response) => {
  try {
    const sessionId = (req.cookies as Record<string, string>)?.gk_session;
    if (!sessionId) {
      res.status(401).json({ error: 'No session — subscribe first.' });
      return;
    }

    const user = await storage.getUserBySession(sessionId);
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found. Subscribe first.' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    // Derive return_url from server-side config only — never from req.headers.origin,
    // which an attacker-controlled page could set to their own domain.
    const appOrigin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ?? "localhost"}`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appOrigin}/account`,
    });
    res.json({ url: portalSession.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default stripeRouter;
