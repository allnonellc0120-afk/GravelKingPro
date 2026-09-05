import type Stripe from 'stripe';
import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import {
  db,
  purchasedTracksTable,
  usersTable,
  promotersTable,
  referralAttributionsTable,
  commissionsTable,
  ipCertStubsTable,
} from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { recordAnalyticsEvent } from './analytics';
import { grantCredits, MONTHLY_CREDITS } from './lib/credits';

/**
 * Loads the managed webhook signing secrets from stripe._managed_webhooks.
 * Exposed as a type so tests can inject a deterministic implementation.
 */
export type SecretsLoader = () => Promise<string[]>;

async function defaultSecretsLoader(): Promise<string[]> {
  // Read ALL secrets ordered newest-first so stale rows are tried last.
  // This is the same table stripe-replit-sync populates via findOrCreateManagedWebhook.
  const result = await db.execute(
    sql`SELECT secret FROM stripe._managed_webhooks ORDER BY created DESC`,
  ) as unknown as { rows: { secret: string }[] };
  return (result.rows ?? []).map((r) => r.secret).filter(Boolean);
}

export class WebhookHandlers {
  /**
   * @param payload   Raw request body Buffer (must NOT be parsed by express.json()).
   * @param signature Stripe-Signature header value.
   * @param req       Optional Express request for structured logging.
   * @param _loadSecrets  Override the signing-secret source (production: DB; tests: injected).
   */
  static async processWebhook(
    payload: Buffer,
    signature: string,
    req?: Request,
    _loadSecrets?: SecretsLoader,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const loadSecrets = _loadSecrets ?? defaultSecretsLoader;

    // Intercept checkout.session.completed for track one-time purchases.
    // We retrieve the signing secret from the stripe._managed_webhooks table so we
    // can construct a verified Stripe event ourselves before stripe-replit-sync
    // processes the webhook (which only mirrors Stripe data into stripe.* tables).
    try {
      const secrets = await loadSecrets();
      let event: Stripe.Event | null = null;
      if (secrets.length > 0) {
        const stripe = await getUncachableStripeClient();
        for (const signingSecret of secrets) {
          try {
            event = stripe.webhooks.constructEvent(payload, signature, signingSecret);
            break;
          } catch {
            // Signed by a different endpoint (e.g. a stale row from a
            // previously connected Stripe account) — try the next secret.
          }
        }
      }

      if (event) {
        if (
          event.type === 'customer.subscription.created' ||
          event.type === 'customer.subscription.updated'
        ) {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
          const userId = subscription.metadata?.userId;
          const [user] = userId
            ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId))
            : await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.stripeCustomerId, customerId));
          if (user) {
            const plan = subscription.metadata?.plan || null;
            const entitled = ['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status);
            await db.update(usersTable).set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              isPro: entitled,
              subscriptionTier: entitled ? plan : null,
              ...(subscription.status === 'trialing' ? { trialUsed: true } : {}),
            }).where(eq(usersTable.id, user.id));
          }
        }
        if (event.type === 'customer.subscription.deleted') {
          const subscription = event.data.object as Stripe.Subscription;
          await db.update(usersTable).set({
            isPro: false,
            subscriptionTier: null,
            stripeSubscriptionId: null,
          }).where(eq(usersTable.stripeSubscriptionId, subscription.id));
        }
        if (event.type === 'payment_intent.succeeded' || event.type === 'setup_intent.succeeded') {
          const intent = event.data.object as Stripe.PaymentIntent | Stripe.SetupIntent;
          const userId = intent.metadata?.userId;
          if (userId) {
            await db.update(usersTable).set({ isPro: true }).where(eq(usersTable.id, userId));
          }
        }
        // ── Embedded one-time purchases (Payment Element flow) ──────────
        // Track sales and $1.99 certificate unlocks now confirm in-app via a
        // PaymentIntent, so fulfillment must listen to payment_intent.succeeded
        // as well as checkout.session.completed (hosted fallback). Same
        // metadata contract and the same idempotency guards.
        if (event.type === 'payment_intent.succeeded') {
          const intent = event.data.object as Stripe.PaymentIntent;
          const meta = intent.metadata ?? {};
          if (meta.kind === 'credits_purchase' && meta.user_id && meta.credits) {
            const credits = Number(meta.credits);
            if (!Number.isInteger(credits) || credits <= 0) {
              throw new Error(`Invalid credits purchase metadata for ${intent.id}`);
            }
            const grant = await grantCredits(
              meta.user_id,
              credits,
              'stripe_purchase',
              `stripe-payment-intent:${intent.id}`,
              intent.id,
            );
            void recordAnalyticsEvent({
              type: "purchase_completed",
              sessionId: meta.user_id,
              path: "/pricing",
              metadata: {
                kind: "credits",
                credits,
                paymentIntentId: intent.id,
                duplicate: !grant.granted,
              },
            }).catch(() => {});
            return;
          }
          if (meta.type === 'track' && meta.track_id && meta.user_id) {
            await db
              .insert(purchasedTracksTable)
              .values({
                userId: meta.user_id,
                trackId: meta.track_id,
                stripeCheckoutSessionId: intent.id,
              })
              .onConflictDoNothing();
            void recordAnalyticsEvent({
              type: "purchase_completed",
              sessionId: meta.user_id,
              path: "/label",
              metadata: { kind: "track", trackId: meta.track_id, paymentIntentId: intent.id },
            }).catch(() => {});
            // Track purchases are fully handled here.
            return;
          }
          if (meta.kind === 'cert_unlock' && meta.cert_id && meta.user_id) {
            await db
              .update(ipCertStubsTable)
              .set({
                unlockedAt: sql`NOW()`,
                unlockSource: 'purchase',
                stripeSessionId: intent.id,
              })
              .where(
                sql`${ipCertStubsTable.certId} = ${meta.cert_id}
                  AND ${ipCertStubsTable.ownerUserId} = ${meta.user_id}
                  AND ${ipCertStubsTable.unlockedAt} IS NULL`,
              );
            void recordAnalyticsEvent({
              type: "purchase_completed",
              sessionId: meta.user_id,
              path: "/mastering",
              metadata: { kind: "cert_unlock", certId: meta.cert_id, paymentIntentId: intent.id },
            }).catch(() => {});
            // Cert unlocks are fully handled here.
            return;
          }
        }
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const userId = session.client_reference_id ?? session.metadata?.userId;
          if (userId && session.mode === "subscription") {
            await db.update(usersTable).set({ trialUsed: true }).where(eq(usersTable.id, userId));
            void recordAnalyticsEvent({
              type: "subscription_activated",
              sessionId: userId,
              path: "/pricing",
              metadata: { plan: session.metadata?.plan ?? "" },
            }).catch(() => {});
          }
        }
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

          // ── Per-certificate $1.99 unlock ─────────────────────────────────
          // Idempotent: the conditional UPDATE only fires while unlocked_at is
          // NULL, so duplicate webhook deliveries are no-ops. Owner-scoped so a
          // paid session can never unlock someone else's certificate.
          if (
            meta.kind === 'cert_unlock' &&
            meta.cert_id &&
            meta.user_id &&
            (session.payment_status === 'paid' || session.status === 'complete')
          ) {
            await db
              .update(ipCertStubsTable)
              .set({
                unlockedAt: sql`NOW()`,
                unlockSource: 'purchase',
                stripeSessionId: session.id,
              })
              .where(
                sql`${ipCertStubsTable.certId} = ${meta.cert_id}
                  AND ${ipCertStubsTable.ownerUserId} = ${meta.user_id}
                  AND ${ipCertStubsTable.unlockedAt} IS NULL`,
              );
            // Cert unlocks are fully handled here — nothing for stripe-replit-sync.
            return;
          }
        }
        // ── Referral commission accrual ──────────────────────────────────
        // Commission only on actually-paid invoices ($0 trial invoices are
        // skipped by the amount_paid > 0 check). Attribution comes from our
        // own DB (written server-side at checkout), never from the client.
        if (event.type === 'invoice.paid') {
          const invoice = event.data.object;
          const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
          if (customerId && invoice.amount_paid > 0 && invoice.id) {
            const [subscriber] = await db
              .select({
                id: usersTable.id,
                subscriptionTier: usersTable.subscriptionTier,
              })
              .from(usersTable)
              .where(eq(usersTable.stripeCustomerId, customerId));
            const tier = subscriber?.subscriptionTier;
            const monthlyCredits = tier === 'pro' || tier === 'weekly'
              ? MONTHLY_CREDITS.pro
              : tier === 'king' || tier === 'monthly'
                ? MONTHLY_CREDITS.king
                : 0;
            if (subscriber && monthlyCredits > 0) {
              await grantCredits(
                subscriber.id,
                monthlyCredits,
                'subscription_monthly',
                `stripe-invoice:${invoice.id}`,
              );
            }
          }
          if (customerId && invoice.amount_paid > 0 && invoice.id) {
            const [user] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.stripeCustomerId, customerId));
            if (user) {
              const [attribution] = await db
                .select()
                .from(referralAttributionsTable)
                .where(eq(referralAttributionsTable.userId, user.id));
              if (attribution) {
                const [promoter] = await db
                  .select()
                  .from(promotersTable)
                  .where(eq(promotersTable.id, attribution.promoterId));
                // Fraud basics: promoter must still be approved, and
                // self-referral never accrues (defense in depth — checkout
                // already refuses to write such an attribution).
                if (promoter && promoter.status === 'approved' && promoter.userId !== user.id) {
                  const commissionCents = Math.floor((invoice.amount_paid * promoter.commissionRate) / 100);
                  if (commissionCents > 0) {
                    // Idempotent — one commission per Stripe invoice.
                    await db
                      .insert(commissionsTable)
                      .values({
                        promoterId: promoter.id,
                        userId: user.id,
                        stripeInvoiceId: invoice.id,
                        invoiceAmountCents: invoice.amount_paid,
                        commissionCents,
                        originalCommissionCents: commissionCents,
                        currency: invoice.currency ?? 'usd',
                      })
                      .onConflictDoNothing();
                  }
                }
              }
            }
          }
        }

        // Refunded charge → adjust the matching commission. charge.refunded
        // fires for BOTH partial and full refunds; charge.amount_refunded is
        // the CUMULATIVE refunded total, so repeated deliveries and multiple
        // partial refunds are naturally idempotent (we always recompute the
        // net commission from the original accrual and the cumulative total).
        // Full refund → status 'reversed' (even if already marked paid, so
        // the admin can see the overpayment); partial refund → commission
        // reduced proportionally, status unchanged.
        if (event.type === 'charge.refunded') {
          const charge = event.data.object as Stripe.Charge & { invoice?: string | { id: string } | null };
          const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
          if (invoiceId) {
            const [commission] = await db
              .select()
              .from(commissionsTable)
              .where(eq(commissionsTable.stripeInvoiceId, invoiceId));
            if (commission) {
              const refundedCents = Math.min(
                Math.max(charge.amount_refunded ?? 0, 0),
                commission.invoiceAmountCents,
              );
              // Original accrual basis (rows created before this column existed
              // have 0 — fall back to the current commission).
              const original = commission.originalCommissionCents || commission.commissionCents;
              const fullyRefunded = refundedCents >= commission.invoiceAmountCents;
              const netCommission = fullyRefunded
                ? 0
                : Math.floor(
                    (original * (commission.invoiceAmountCents - refundedCents)) /
                      commission.invoiceAmountCents,
                  );
              await db
                .update(commissionsTable)
                .set({
                  refundedCents,
                  commissionCents: netCommission,
                  ...(fullyRefunded && { status: 'reversed' }),
                })
                .where(eq(commissionsTable.stripeInvoiceId, invoiceId));
            }
          }
        }
      }
    } catch (err) {
      // Log so the error is observable, but never block stripe-replit-sync processing
      // if our track handler fails.
      const log = req?.log ?? { error: console.error };
      log.error({ err }, 'Custom webhook handler failed');
    }

    const sync = await getStripeSync();
    try {
      await sync.processWebhook(payload, signature);
    } catch (err: any) {
      // stripe-replit-sync cannot insert invoice.upcoming events: Stripe sends
      // them with a temporary null ID that violates the invoices NOT NULL
      // constraint. These are pre-billing notices only — skipping is safe and
      // stops Stripe from retrying endlessly (which floods logs with 400s).
      if (err?.code === "23502" && err?.table === "invoices" && err?.column === "id") {
        return;
      }
      throw err;
    }
  }
}
