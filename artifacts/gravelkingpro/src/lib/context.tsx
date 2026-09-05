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

const SEP_STRENGTH_KEY = "gkp_sep_strength";
const DEFAULT_SEP_STRENGTH = 0.75;
function clampStrength(n: number) {
  if (Number.isNaN(n)) return DEFAULT_SEP_STRENGTH;
  return Math.min(2.0, Math.max(0.1, n));
}

interface AppState {
  tier: SubscriptionTier;
  /** Pro+ : full Foundry exports, Vocal Booth tools, and JAX provenance */
  hasSplits: boolean;
  /** King+ : advanced Foundry and Vocal Booth controls */
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
  redeemPromo: (code: string) => Promise<boolean>;
  revokePromo: () => void;
  /** Persisted separation/carve strength (multiplier) applied across the separation tools */
  sepStrength: number;
  setSepStrength: (n: number) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

/** Map any stored/legacy plan string into the canonical client tier. */
function normalizePlan(plan?: string | null): SubscriptionTier {
  if (!plan) return null;
  const p = plan.toLowerCase().trim().replace(/\s+/g, "_");
  switch (p) {
    case "weekly":
    case "pro":
      return "weekly";
    case "monthly":
    case "studio":
    case "king":
      return "monthly";
    case "node_auditor":
      return "node_auditor";
    case "splits":
      return "weekly";
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
  const [sepStrength, setSepStrengthState] = useState<number>(DEFAULT_SEP_STRENGTH);

  useEffect(() => {
    const saved = localStorage.getItem(SEP_STRENGTH_KEY);
    if (saved !== null) setSepStrengthState(clampStrength(parseFloat(saved)));
  }, []);

  const refreshSubscription = useCallback(async (): Promise<{ tier: SubscriptionTier; plan: string | null; isDeveloper?: boolean }> => {
    try {
      setIsLoadingSubscription(true);
      const resp = await fetch("/api/subscription/status", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json() as { isPro: boolean; plan: string | null; isDeveloper?: boolean; promoExpiresAt?: string };
        setPlan(data.plan);
        setIsDeveloper(data.isDeveloper ?? false);
        const t = normalizePlan(data.plan);
        setUserTier(t);
        setActivePromo(data.promoExpiresAt && new Date(data.promoExpiresAt) > new Date() ? "GKPRO7DAY" : null);
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

  const promoTier: SubscriptionTier = activePromo ? "monthly" : null;
  const tierOrder: Array<SubscriptionTier> = [null, "weekly", "monthly", "node_auditor"];
  const effectiveTier: SubscriptionTier =
    tierOrder.indexOf(promoTier) > tierOrder.indexOf(userTier) ? promoTier : userTier;

  const tierRank = tierOrder.indexOf(effectiveTier);
  const hasSplits = tierRank >= tierOrder.indexOf("weekly");
  const isStudio = tierRank >= tierOrder.indexOf("monthly");
  const isPro = isStudio;

  const setTier = (t: SubscriptionTier) => setUserTier(t);

  const redeemPromo = useCallback(async (code: string): Promise<boolean> => {
    const response = await fetch("/api/promo/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    });
    if (!response.ok) return false;
    setActivePromo("GKPRO7DAY");
    await refreshSubscription();
    return true;
  }, []);

  const revokePromo = useCallback(() => {
    setActivePromo(null);
  }, []);

  const setSepStrength = useCallback((n: number) => {
    const c = clampStrength(n);
    setSepStrengthState(c);
    try { localStorage.setItem(SEP_STRENGTH_KEY, String(c)); } catch { /* localStorage unavailable */ }
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
      sepStrength,
      setSepStrength,
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
