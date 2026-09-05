/**
 * Price-parity check: advertised plan prices vs. what Stripe actually charges.
 *
 * Guards against drift like the Node Auditor incident ($499 shown while Stripe
 * charged $249.50). Two layers:
 *
 *   1. Live Stripe: each advertised product must exist, be active, and have
 *      exactly one active recurring price whose amount + interval match the
 *      advertised price.
 *   2. UI source scan: every dollars-and-cents price token ($X.XX) in the
 *      customer-facing pricing pages must be one of the advertised prices,
 *      and each advertised price must actually appear where expected.
 *
 * The single source of truth below must be kept in sync with
 * scripts/src/seed-products.ts when pricing changes.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { getUncachableStripeClient } from "../stripeClient";

// ── Source of truth: what we advertise ───────────────────────────────────────
const ADVERTISED = [
  { product: "GravelKing Weekly", cents: 899, interval: "week", display: "$8.99" },
  { product: "GravelKing Studio", cents: 1999, interval: "month", display: "$19.99" },
  { product: "Node Auditor", cents: 24950, interval: "month", display: "$249.50" },
] as const;

const ALLOWED_TOKENS = new Set<string>([
  ...ADVERTISED.map((a) => a.display),
  "$1.99", // Per-certificate impulse unlock, not a subscription price.
]);

// UI files that show plan prices, relative to the workspace root.
const UI_FILES = [
  "artifacts/gravelkingpro/src/pages/pricing.tsx",
  "artifacts/gravelkingpro/src/pages/home.tsx",
  "artifacts/gravelkingpro/src/pages/download.tsx",
];

// ── Tiny assertion harness (matches the other tests in this suite) ───────────
let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate workspace root (pnpm-workspace.yaml)");
}

async function main(): Promise<void> {
  // ── 1. Live Stripe prices ──────────────────────────────────────────────────
  console.log("\nStripe: active prices match advertised prices");
  const stripe = await getUncachableStripeClient();
  const products = await stripe.products.list({ active: true, limit: 100 });

  for (const plan of ADVERTISED) {
    const product = products.data.find((p) => p.name === plan.product);
    check(`product "${plan.product}" exists and is active`, Boolean(product));
    if (!product) continue;

    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    const forInterval = prices.data.filter((p) => p.recurring?.interval === plan.interval);

    check(
      `"${plan.product}" has exactly one active ${plan.interval}ly price`,
      forInterval.length === 1,
      `found ${forInterval.length}`,
    );
    const price = forInterval[0];
    if (!price) continue;

    check(
      `"${plan.product}" charges ${plan.display}/${plan.interval} (advertised)`,
      price.unit_amount === plan.cents && price.currency === "usd",
      `Stripe charges ${price.currency} ${(price.unit_amount ?? 0) / 100}, advertised ${plan.display}`,
    );
  }

  // ── 2. UI source scan ──────────────────────────────────────────────────────
  console.log("\nUI pages: every displayed $X.XX price is an advertised price");
  const root = findWorkspaceRoot();
  const priceToken = /\$\d+(?:,\d{3})*\.\d{2}/g;

  for (const rel of UI_FILES) {
    const abs = path.join(root, rel);
    check(`${rel} exists`, existsSync(abs));
    if (!existsSync(abs)) continue;

    const src = readFileSync(abs, "utf8");
    const tokens = src.match(priceToken) ?? [];
    const rogue = tokens.filter((t) => !ALLOWED_TOKENS.has(t));
    check(
      `${rel} has no unrecognized price tokens`,
      rogue.length === 0,
      `rogue prices: ${[...new Set(rogue)].join(", ")}`,
    );
  }

  // Pages render prices live from GET /api/stripe/products via the shared
  // usePlanPrices hook; the only hardcoded amounts left are its fallbacks.
  // Those fallbacks must stay in sync with the advertised (Stripe) prices.
  const hookRel = "artifacts/gravelkingpro/src/lib/usePlanPrices.ts";
  const hookAbs = path.join(root, hookRel);
  check(`${hookRel} exists (live-price hook)`, existsSync(hookAbs));
  if (existsSync(hookAbs)) {
    const src = readFileSync(hookAbs, "utf8");
    const tokens = src.match(priceToken) ?? [];
    const rogue = tokens.filter((t) => !ALLOWED_TOKENS.has(t));
    check(
      `${hookRel} fallbacks contain no unrecognized price tokens`,
      rogue.length === 0,
      `rogue prices: ${[...new Set(rogue)].join(", ")}`,
    );
    for (const plan of ADVERTISED) {
      check(`${hookRel} fallback shows ${plan.display} (${plan.product})`, src.includes(plan.display));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nPRICE PARITY FAILURES (advertised vs Stripe drift):");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("price-parity test crashed:", err);
  process.exit(1);
});
