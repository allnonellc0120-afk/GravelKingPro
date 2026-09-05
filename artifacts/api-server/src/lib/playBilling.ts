// Google Play Billing — server-side purchase verification.
//
// The Android app (TWA) purchases subscriptions through Google Play via the
// Digital Goods API. The client only ever sends us the purchaseToken; this
// module asks the Play Developer API whether that token represents a live
// subscription, and for which product. Google is the source of truth — we
// never trust client-claimed products, states, or expiry times.
//
// There is no Pub/Sub RTDN pipeline; renewals are picked up lazily by
// re-verifying a token once its cached expiryTime passes (see storage.ts).

import { GoogleAuth } from "google-auth-library";

export const PLAY_PACKAGE_NAME = "com.gravelkingpro.app";

/** Play productId → canonical subscription tier (matches Stripe tiers). */
export const PLAY_PRODUCT_TIERS: Record<string, "pro" | "king" | "node_auditor"> = {
  gk_weekly: "pro",
  gk_studio: "king",
  gk_node_auditor: "node_auditor",
};

/** Token is malformed / unknown to Google (400/404) — permanently bad, vs a transient API failure. */
export class PlayTokenInvalidError extends Error {}

let _auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (_auth) return _auth;
  const raw = process.env.GCP_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT is not configured — cannot verify Google Play purchases");
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };
  _auth = new GoogleAuth({
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return _auth;
}

async function playFetch(path: string, init?: RequestInit): Promise<Response> {
  const client = await getAuth().getClient();
  const { token } = await client.getAccessToken();
  return fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE_NAME}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
  );
}

export interface PlayVerification {
  /** True when the user should currently have access (active, in grace, or canceled-but-not-yet-expired). */
  entitled: boolean;
  productId: string | null;
  tier: "pro" | "king" | "node_auditor" | null;
  /** Normalized: active | grace | canceled | expired | on_hold | paused | pending | unknown */
  state: string;
  expiryTime: Date | null;
  autoRenewing: boolean;
  acknowledgementPending: boolean;
  /** Set when this token replaced an older one (upgrade/resubscribe) — the old token must be retired. */
  linkedPurchaseToken: string | null;
}

const STATE_MAP: Record<string, string> = {
  SUBSCRIPTION_STATE_ACTIVE: "active",
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace",
  SUBSCRIPTION_STATE_CANCELED: "canceled",
  SUBSCRIPTION_STATE_EXPIRED: "expired",
  SUBSCRIPTION_STATE_ON_HOLD: "on_hold",
  SUBSCRIPTION_STATE_PAUSED: "paused",
  SUBSCRIPTION_STATE_PENDING: "pending",
};

interface SubscriptionPurchaseV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
}

export async function verifyPlaySubscription(purchaseToken: string): Promise<PlayVerification> {
  const resp = await playFetch(
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  const body = (await resp.json().catch(() => null)) as
    | (SubscriptionPurchaseV2 & { error?: { message?: string } })
    | null;

  if (!resp.ok) {
    const msg = body?.error?.message ?? `HTTP ${resp.status}`;
    if (resp.status === 400 || resp.status === 404) {
      throw new PlayTokenInvalidError(`Google Play rejected the purchase token: ${msg}`);
    }
    throw new Error(`Google Play verification failed: ${msg}`);
  }
  if (!body) throw new Error("Google Play verification returned an empty response");

  // A subscription can have multiple line items (e.g. during plan changes);
  // the entitlement follows the line with the furthest expiry.
  let productId: string | null = null;
  let expiryTime: Date | null = null;
  let autoRenewing = false;
  for (const li of body.lineItems ?? []) {
    const e = li.expiryTime ? new Date(li.expiryTime) : null;
    if (!expiryTime || (e && e.getTime() > expiryTime.getTime())) {
      expiryTime = e;
      productId = li.productId ?? null;
      autoRenewing = Boolean(li.autoRenewingPlan?.autoRenewEnabled);
    }
  }

  const state = STATE_MAP[body.subscriptionState ?? ""] ?? "unknown";
  // "canceled" = auto-renew turned off, but paid time keeps running until expiry.
  const entitled =
    expiryTime !== null &&
    expiryTime.getTime() > Date.now() &&
    ["active", "grace", "canceled"].includes(state);

  return {
    entitled,
    productId,
    tier: productId ? PLAY_PRODUCT_TIERS[productId] ?? null : null,
    state,
    expiryTime,
    autoRenewing,
    acknowledgementPending: body.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
    linkedPurchaseToken: body.linkedPurchaseToken ?? null,
  };
}

/** Acknowledge a subscription purchase (required within 3 days or Google auto-refunds). */
export async function acknowledgePlaySubscription(
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const resp = await playFetch(
    `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", body: "{}" },
  );
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
    // Already-acknowledged shows up as a 400 — treat as success (idempotent).
    const msg = body?.error?.message ?? "";
    if (resp.status === 400 && /already.*acknowledg/i.test(msg)) return;
    throw new Error(`Failed to acknowledge Play purchase: ${msg || `HTTP ${resp.status}`}`);
  }
}
