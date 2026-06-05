import { Router } from "express";
import { stripeStorage } from "../stripeStorage";
import { getUncachableStripeClient } from "../stripeClient";

const stripeRouter = Router();

// List products with prices — used by the Pricing page
stripeRouter.get("/stripe/products", async (_req, res) => {
  const rows = await stripeStorage.listProductsWithPrices();

  const productsMap = new Map<string, any>();
  for (const row of rows as any[]) {
    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, {
        id: row.product_id,
        name: row.product_name,
        description: row.product_description,
        active: row.product_active,
        metadata: row.product_metadata,
        prices: [],
      });
    }
    if (row.price_id) {
      productsMap.get(row.product_id).prices.push({
        id: row.price_id,
        unit_amount: row.unit_amount,
        currency: row.currency,
        recurring: row.recurring,
        active: row.price_active,
      });
    }
  }

  res.json({ data: Array.from(productsMap.values()) });
});

// Create Stripe checkout session
stripeRouter.post("/stripe/checkout", async (req: any, res) => {
  const { priceId, email } = req.body;

  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    // Find or create customer
    let customerId: string | undefined;
    if (email) {
      const existing = await stripeStorage.getUserByEmail(email);
      if (existing?.stripe_customer_id) {
        customerId = existing.stripe_customer_id as string;
      } else {
        const customer = await stripe.customers.create({ email });
        customerId = customer.id;
        const userId = `user_${Date.now()}`;
        await stripeStorage.upsertUser(userId, email, customerId);
      }
    }

    const origin = req.headers.origin || `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
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

// Check if a session resulted in an active subscription
stripeRouter.get("/stripe/subscription-status", async (req, res) => {
  const { session_id } = req.query as { session_id?: string };

  if (!session_id) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid" || session.status === "complete") {
      res.json({ active: true, customerId: session.customer });
    } else {
      res.json({ active: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default stripeRouter;
