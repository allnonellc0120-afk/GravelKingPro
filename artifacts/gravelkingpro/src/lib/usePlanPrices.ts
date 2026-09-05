import { useEffect, useState } from "react";

export type PlanTier = "weekly" | "monthly" | "node_auditor";

export interface PlanPrice {
  /** Formatted dollar amount, e.g. "$9.99" */
  amount: string;
  /** Billing period suffix, e.g. "/week" or "/mo" */
  period: string;
  /** Convenience label, e.g. "$24.99/mo" */
  label: string;
}

/** Fallbacks shown until (or if) the live Stripe products load. */
export const FALLBACK_PRICES: Record<PlanTier, PlanPrice> = {
  weekly: { amount: "$9.99", period: "/mo", label: "$9.99/mo" },
  monthly: { amount: "$24.99", period: "/mo", label: "$24.99/mo" },
  node_auditor: { amount: "$249.50", period: "/mo", label: "$249.50/mo" },
};

const PRODUCT_NAME_TO_TIER: Record<string, PlanTier> = {
  "GravelKing Weekly": "weekly",
  "GravelKing Studio": "monthly",
  "Node Auditor": "node_auditor",
};

interface StripeProduct {
  name: string;
  metadata?: Record<string, string>;
  prices: Array<{
    unit_amount: number | null;
    currency: string;
    recurring?: { interval: string } | null;
  }>;
}

function formatAmount(unitAmount: number, currency: string): string {
  const value = unitAmount / 100;
  const formatted = Number.isInteger(value) ? `${value}` : value.toFixed(2);
  return currency.toLowerCase() === "usd" ? `$${formatted}` : `${formatted} ${currency.toUpperCase()}`;
}

function periodForInterval(interval?: string | null): string {
  switch (interval) {
    case "week": return "/week";
    case "month": return "/mo";
    case "year": return "/yr";
    case "day": return "/day";
    default: return "";
  }
}

// Module-level cache so multiple pages/components share one fetch per session.
let cached: Record<PlanTier, PlanPrice> | null = null;
let inflight: Promise<Record<PlanTier, PlanPrice>> | null = null;

async function fetchPlanPrices(): Promise<Record<PlanTier, PlanPrice>> {
  const res = await fetch("/api/stripe/products", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load products");
  const body = await res.json() as { data?: StripeProduct[] };
  const result: Record<PlanTier, PlanPrice> = { ...FALLBACK_PRICES };
  for (const product of body.data ?? []) {
    const tier = (product.metadata?.tier as PlanTier | undefined) ?? PRODUCT_NAME_TO_TIER[product.name];
    if (!tier || !(tier in FALLBACK_PRICES)) continue;
    const price = product.prices?.find((p) => typeof p.unit_amount === "number");
    if (!price || price.unit_amount == null) continue;
    const amount = formatAmount(price.unit_amount, price.currency);
    const period = periodForInterval(price.recurring?.interval);
    result[tier] = { amount, period, label: `${amount}${period}` };
  }
  return result;
}

/**
 * Live plan prices from the Stripe products endpoint.
 * Returns fallback (last-known) prices immediately, then updates once loaded.
 */
export function usePlanPrices(): Record<PlanTier, PlanPrice> {
  const [prices, setPrices] = useState<Record<PlanTier, PlanPrice>>(cached ?? FALLBACK_PRICES);

  useEffect(() => {
    if (cached) return;
    inflight ??= fetchPlanPrices().then((r) => { cached = r; return r; });
    let alive = true;
    inflight
      .then((r) => { if (alive) setPrices(r); })
      .catch(() => { inflight = null; /* keep fallbacks */ });
    return () => { alive = false; };
  }, []);

  return prices;
}
