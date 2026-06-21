import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db, purchasedTracksTable } from '@workspace/db';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, req?: Request): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Intercept checkout.session.completed for track one-time purchases.
    // We retrieve the signing secret from the stripe._managed_webhooks table so we
    // can construct a verified Stripe event ourselves before stripe-replit-sync
    // processes the webhook (which only mirrors Stripe data into stripe.* tables).
    try {
      const result = await db.execute(
        sql`SELECT secret FROM stripe._managed_webhooks LIMIT 1`
      ) as unknown as { rows: { secret: string }[] };

      const signingSecret = result.rows?.[0]?.secret;
      if (signingSecret) {
        const stripe = await getUncachableStripeClient();
        const event = stripe.webhooks.constructEvent(payload, signature, signingSecret);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const meta = session.metadata ?? {};
          // Specified metadata contract: track_id and user_id (snake_case).
          if (
            meta.track_id &&
            meta.user_id &&
            (session.payment_status === 'paid' || session.status === 'complete')
          ) {
            // Idempotent insert — duplicate webhook deliveries are safe.
            await db
              .insert(purchasedTracksTable)
              .values({
                userId: meta.user_id,
                trackId: meta.track_id,
                stripeCheckoutSessionId: session.id,
              })
              .onConflictDoNothing();

            // Track purchases are fully handled here.
            // Do NOT forward to stripe-replit-sync (which mirrors subscription data).
            return;
          }
        }
      }
    } catch (err) {
      // Log so the error is observable, but never block stripe-replit-sync processing
      // if our track handler fails.
      const log = req?.log ?? { error: console.error };
      log.error({ err }, 'Track purchase webhook handler failed');
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
