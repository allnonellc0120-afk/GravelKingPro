import { Router } from "express";
import Stripe from "stripe";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const stripeRouter = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(key);
}

// List products with prices — Pricing page uses this
stripeRouter.get("/stripe/products", async (_req, res) => {
  try {
    const stripe = getStripe();
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Stripe Checkout Session
stripeRouter.post("/stripe/checkout", async (req: any, res) => {
  const { priceId } = req.body;
  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }
  try {
    const stripe = getStripe();
    const origin = req.headers.origin ||
      `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
    };

    // Attach existing Stripe customer if user is already linked
    if (req.isAuthenticated()) {
      const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
      if (dbUser?.stripeCustomerId) {
        sessionParams.customer = dbUser.stripeCustomerId;
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check if a checkout session resulted in a paid subscription, then persist tier to DB
stripeRouter.get("/stripe/subscription-status", async (req: any, res) => {
  const { session_id } = req.query as { session_id?: string };
  if (!session_id) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }
  try {
    const stripe = getStripe();

    // Expand line items so we can read the product metadata for the tier
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items.data.price.product"],
    });

    const active = session.payment_status === "paid" || session.status === "complete";

    // Determine tier from the first line item's product metadata
    let tier: string | null = null;
    const lineItem = session.line_items?.data?.[0];
    if (lineItem) {
      const price = lineItem.price as Stripe.Price | null;
      const product = price?.product as Stripe.Product | null;
      tier = product?.metadata?.tier ?? null;
    }

    // Persist to DB if user is authenticated
    if (active && req.isAuthenticated()) {
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const isPro = tier === "pro" || tier === "node_auditor";
      await db.update(usersTable).set({
        subscriptionTier: tier,
        isPro,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      }).where(eq(usersTable.id, req.user.id));
    }

    res.json({ active, tier, customerId: session.customer });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default stripeRouter;
