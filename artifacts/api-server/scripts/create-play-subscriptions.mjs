// Create + activate Google Play subscription products for GravelKing Pro.
// Creates the current monthly Pro and King products. The old gk_weekly and
// gk_studio products are intentionally retained as legacy verification aliases
// for subscribers who purchased before the plan sheet changed.
// Idempotent: existing products are left alone; activation errors on an
// already-active base plan are reported but not fatal.
// Run from artifacts/api-server: node scripts/create-play-subscriptions.mjs
import { GoogleAuth } from "google-auth-library";

const PKG = "com.gravelkingpro.app";
// Must match the regions version Google's convertRegionPrices output uses
// (e.g. BG is EUR from 2026 — older versions expect BGN and reject the price list).
const REGIONS_VERSION = "2025/03"; // latest per Google's API error message

const PRODUCTS = [
  { productId: "gk_pro", title: "GravelKing Pro", basePlanId: "p1m", period: "P1M", usd: { units: "9", nanos: 990000000 } },
  { productId: "gk_king", title: "GravelKing King", basePlanId: "p1m", period: "P1M", usd: { units: "24", nanos: 990000000 } },
  { productId: "gk_node_auditor", title: "Node Auditor", basePlanId: "p1m", period: "P1M", usd: { units: "249", nanos: 500000000 } },
];

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

async function j(resp, context) {
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error(`FAIL ${context}:`, resp.status, JSON.stringify(body?.error ?? body));
    process.exit(1);
  }
  return body;
}

for (const p of PRODUCTS) {
  const got = await fetch(`${base}/subscriptions/${p.productId}`, { headers: H });
  if (got.ok) {
    console.log(`${p.productId}: already exists`);
  } else if (got.status === 404) {
    // Convert the USD price into Google's per-region price list.
    const conv = await j(
      await fetch(`${base}/pricing:convertRegionPrices`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ price: { currencyCode: "USD", units: p.usd.units, nanos: p.usd.nanos } }),
      }),
      `convertRegionPrices ${p.productId}`,
    );
    const regionalConfigs = Object.values(conv.convertedRegionPrices ?? {}).map((r) => ({
      regionCode: r.regionCode,
      newSubscriberAvailability: true,
      price: r.price,
    }));
    const body = {
      packageName: PKG,
      productId: p.productId,
      listings: [{ languageCode: "en-US", title: p.title }],
      basePlans: [
        {
          basePlanId: p.basePlanId,
          autoRenewingBasePlanType: {
            billingPeriodDuration: p.period,
            gracePeriodDuration: "P7D", // Google caps weekly-plan grace at P7D
            resubscribeState: "RESUBSCRIBE_STATE_ACTIVE",
            prorationMode: "SUBSCRIPTION_PRORATION_MODE_CHARGE_ON_NEXT_BILLING_DATE",
            legacyCompatible: true,
          },
          regionalConfigs,
          ...(conv.convertedOtherRegionsPrice
            ? { otherRegionsConfig: { ...conv.convertedOtherRegionsPrice, newSubscriberAvailability: true } }
            : {}),
        },
      ],
    };
    const created = await j(
      await fetch(
        `${base}/subscriptions?productId=${p.productId}&regionsVersion.version=${encodeURIComponent(REGIONS_VERSION)}`,
        { method: "POST", headers: H, body: JSON.stringify(body) },
      ),
      `create ${p.productId}`,
    );
    console.log(`${p.productId}: created (${created.listings?.[0]?.title})`);
  } else {
    await j(got, `get ${p.productId}`);
  }

  const act = await fetch(`${base}/subscriptions/${p.productId}/basePlans/${p.basePlanId}:activate`, {
    method: "POST",
    headers: H,
    body: "{}",
  });
  if (act.ok) {
    console.log(`${p.productId}/${p.basePlanId}: base plan ACTIVE`);
  } else {
    const b = await act.json().catch(() => null);
    console.log(`${p.productId}/${p.basePlanId}: activate -> ${act.status} ${b?.error?.message ?? ""}`);
  }
}
console.log("done");
