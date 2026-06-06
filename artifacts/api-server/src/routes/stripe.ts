import { Router } from "express";
import Stripe from "stripe";

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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check if a checkout session resulted in a paid subscription
stripeRouter.get("/stripe/subscription-status", async (req, res) => {
  const { session_id } = req.query as { session_id?: string };
  if (!session_id) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const active = session.payment_status === "paid" || session.status === "complete";
    res.json({ active, customerId: session.customer });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default stripeRouter;
