import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export type Results = {
  throughput: string;
  stability: string;
  efficiency: string;
  decayRate: string;
  originalSum: number;
  carvedSum: number;
  parityStatus: "VALIDATED" | "KERNEL_VIOLATION";
  multiplier: number;
  sliceSize: number;
  runDate: string;
} | null;

export type SubscriptionTier = "weekly" | "monthly" | "node_auditor" | null;

const PROMO_CODES: Record<string, SubscriptionTier> = {
  iliveforhope: "node_auditor",
};
const PROMO_STORAGE_KEY = "gkp_promo_code";

interface AppState {
  tier: SubscriptionTier;
  /** weekly+ : unlimited voice removal / stem split + preset masters */
  hasSplits: boolean;
  /** monthly+ (Studio) : adjustable mastering + live DAW */
  isStudio: boolean;
  /** Backwards-compatible alias for isStudio (Studio-gated features) */
  isPro: boolean;
  /** isDeveloper flag for admin access */
  isDeveloper: boolean;
  plan: string | null;
  isLoadingSubscription: boolean;
  setTier: (tier: SubscriptionTier) => void;
  refreshSubscription: () => Promise<{ tier: SubscriptionTier; plan: string | null; isDeveloper?: boolean }>;
  results: Results;
  setResults: (results: Results) => void;
  hasRun: boolean;
  setHasRun: (hasRun: boolean) => void;
  /** null = no promo active, string = the active promo code */
  activePromo: string | null;
  /** Returns true if code was valid, false if invalid */
  redeemPromo: (code: string) => boolean;
  revokePromo: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

/** Map any stored/legacy plan string into the canonical client tier. */
function normalizePlan(plan?: string | null): SubscriptionTier {
  if (!plan) return null;
  const p = plan.toLowerCase().trim().replace(/\s+/g, "_");
  switch (p) {
    case "weekly":
      return "weekly";
    case "monthly":
    case "studio":
      return "monthly";
    case "node_auditor":
      return "node_auditor";
    // Legacy values from the previous pricing structure.
    case "splits":
      return "weekly";
    case "pro":
      return "monthly";
    default:
      return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [userTier, setUserTier] = useState<SubscriptionTier>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [activePromo, setActivePromo] = useState<string | null>(null);
  const [results, setResults] = useState<Results>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PROMO_STORAGE_KEY);
    if (saved && PROMO_CODES[saved]) {
      setActivePromo(saved);
    }
  }, []);

  const refreshSubscription = useCallback(async (): Promise<{ tier: SubscriptionTier; plan: string | null; isDeveloper?: boolean }> => {
    try {
      setIsLoadingSubscription(true);
      const resp = await fetch("/api/subscription/status", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json() as { isPro: boolean; plan: string | null; isDeveloper?: boolean };
        setPlan(data.plan);
        setIsDeveloper(data.isDeveloper ?? false);
        const t = normalizePlan(data.plan);
        setUserTier(t);
        return { tier: t, plan: data.plan, isDeveloper: data.isDeveloper };
      }
    } catch {
      // Network error — leave tier as-is
    } finally {
      setIsLoadingSubscription(false);
    }
    return { tier: null, plan: null, isDeveloper: false };
  }, []);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  const promoTier: SubscriptionTier = activePromo ? (PROMO_CODES[activePromo] ?? null) : null;
  const tierOrder: Array<SubscriptionTier> = [null, "weekly", "monthly", "node_auditor"];
  const effectiveTier: SubscriptionTier =
    tierOrder.indexOf(promoTier) > tierOrder.indexOf(userTier) ? promoTier : userTier;

  const tierRank = tierOrder.indexOf(effectiveTier);
  const hasSplits = tierRank >= tierOrder.indexOf("weekly");
  const isStudio = tierRank >= tierOrder.indexOf("monthly");
  const isPro = isStudio;

  const setTier = (t: SubscriptionTier) => setUserTier(t);

  const redeemPromo = useCallback((code: string): boolean => {
    const normalized = code.trim().toLowerCase();
    if (PROMO_CODES[normalized]) {
      setActivePromo(normalized);
      localStorage.setItem(PROMO_STORAGE_KEY, normalized);
      return true;
    }
    return false;
  }, []);

  const revokePromo = useCallback(() => {
    setActivePromo(null);
    localStorage.removeItem(PROMO_STORAGE_KEY);
  }, []);

  return (
    <AppContext.Provider value={{
      tier: effectiveTier,
      hasSplits,
      isStudio,
      isPro,
      isDeveloper,
      plan,
      isLoadingSubscription,
      setTier,
      refreshSubscription,
      results,
      setResults,
      hasRun,
      setHasRun,
      activePromo,
      redeemPromo,
      revokePromo,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used within AppProvider");
  return context;
}
