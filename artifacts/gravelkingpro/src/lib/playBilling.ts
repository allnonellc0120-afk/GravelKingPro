// Google Play Billing via the Digital Goods API.
//
// Only available when the app runs inside the Android TWA installed from
// Google Play (Chrome exposes window.getDigitalGoodsService there). On the
// open web — iPad, desktop, any browser — this resolves to null and the
// pricing page falls back to Stripe checkout.

export const PLAY_BILLING_METHOD = "https://play.google.com/billing";

/** Plan id (client) → current monthly Play productId. */
export const PLAN_PLAY_SKUS: Record<"weekly" | "monthly" | "node_auditor", string> = {
  weekly: "gk_pro",
  monthly: "gk_king",
  node_auditor: "gk_node_auditor",
};

export interface PlayItemDetails {
  itemId: string;
  title: string;
  description?: string;
  price: { currency: string; value: string };
  /** ISO-8601 subscription duration returned by the Digital Goods API. */
  subscriptionPeriod?: string;
}

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<PlayItemDetails[]>;
  listPurchases(): Promise<Array<{ itemId: string; purchaseToken: string }>>;
}

let servicePromise: Promise<DigitalGoodsService | null> | null = null;

/** Resolves the Play Billing service, or null when not running inside the Play app. */
export function getPlayBillingService(): Promise<DigitalGoodsService | null> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const w = window as unknown as {
        getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService>;
      };
      if (typeof w.getDigitalGoodsService !== "function") return null;
      try {
        return await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
      } catch {
        return null;
      }
    })();
  }
  return servicePromise;
}

export function formatPlayPrice(d: PlayItemDetails): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: d.price.currency,
    }).format(Number(d.price.value));
  } catch {
    return `${d.price.value} ${d.price.currency}`;
  }
}

/** Convert Play's ISO-8601 billing duration into a customer-facing suffix. */
export function formatPlayBillingPeriod(subscriptionPeriod?: string): string {
  if (!subscriptionPeriod) return "";

  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(subscriptionPeriod);
  if (!match) return "";

  const parts: Array<[string | undefined, string, string]> = [
    [match[1], "year", "years"],
    [match[2], "month", "months"],
    [match[3], "week", "weeks"],
    [match[4], "day", "days"],
  ].filter(([value]) => value !== undefined) as Array<[string, string, string]>;
  if (parts.length !== 1) return "";

  const [value, singular, plural] = parts[0];
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) return "";
  return count === 1 ? `/${singular}` : `/${count} ${plural}`;
}

/**
 * Run the Google Play purchase sheet for `sku`, then verify the purchase
 * server-side. The sheet's `complete()` state reflects the verification
 * result, so Play won't show "purchase successful" for something the server
 * rejected. Throws on failure; rejects with DOMException AbortError when the
 * user dismisses the sheet.
 */
export async function purchasePlaySubscription(
  sku: string,
  verifyOnServer: (purchaseToken: string) => Promise<boolean>,
): Promise<void> {
  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku } }],
    // Play ignores this total (pricing comes from the Play product), but the
    // PaymentRequest constructor requires one.
    { total: { label: "Subscription", amount: { currency: "USD", value: "0" } } },
  );

  const response = await request.show();
  const details = response.details as { purchaseToken?: string; token?: string };
  const purchaseToken = details.purchaseToken ?? details.token;

  let ok = false;
  try {
    if (purchaseToken) ok = await verifyOnServer(purchaseToken);
  } finally {
    await response.complete(ok ? "success" : "fail").catch(() => {});
  }
  if (!purchaseToken) throw new Error("Google Play did not return a purchase token");
  if (!ok) {
    throw new Error(
      "Your purchase could not be verified. If you were charged, reopen this page to restore it automatically.",
    );
  }
}

/**
 * Re-link any existing Play purchases to the signed-in account (e.g. after
 * reinstalling, or if verification failed right after purchase). Returns how
 * many purchases verified successfully.
 */
export async function restorePlayPurchases(
  verifyOnServer: (purchaseToken: string) => Promise<boolean>,
): Promise<number> {
  const service = await getPlayBillingService();
  if (!service) return 0;
  const purchases = await service.listPurchases().catch(() => []);
  let restored = 0;
  for (const p of purchases) {
    try {
      if (await verifyOnServer(p.purchaseToken)) restored++;
    } catch {
      /* keep going — one bad token shouldn't block the rest */
    }
  }
  return restored;
}
