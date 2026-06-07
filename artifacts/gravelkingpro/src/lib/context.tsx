import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";

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

export type SubscriptionTier = "splits" | "pro" | "node_auditor" | null;

const PROMO_CODES: Record<string, SubscriptionTier> = {
  iliveforhope: "node_auditor",
};
const PROMO_STORAGE_KEY = "gkp_promo_code";

interface AppState {
  tier: SubscriptionTier;
  hasSplits: boolean;
  isPro: boolean;
  setTier: (tier: SubscriptionTier) => void;
  setIsPro: (value: boolean) => void;
  usedFreeSplit: boolean;
  setUsedFreeSplit: (v: boolean) => void;
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

function tierFromUser(subscriptionTier?: string | null, isPro?: boolean): SubscriptionTier {
  if (subscriptionTier === "splits") return "splits";
  if (subscriptionTier === "pro" || subscriptionTier === "node_auditor") return subscriptionTier;
  if (isPro) return "pro";
  return null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [userTier, setUserTier] = useState<SubscriptionTier>(null);
  const [activePromo, setActivePromo] = useState<string | null>(null);
  const [usedFreeSplit, setUsedFreeSplit] = useState(false);
  const [results, setResults] = useState<Results>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PROMO_STORAGE_KEY);
    if (saved && PROMO_CODES[saved]) {
      setActivePromo(saved);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      setUserTier(tierFromUser(user.subscriptionTier, user.isPro));
      setUsedFreeSplit(user.usedFreeSplit ?? false);
    } else if (!isLoading && !user) {
      setUserTier(null);
      setUsedFreeSplit(false);
    }
  }, [user, isLoading]);

  const promoTier: SubscriptionTier = activePromo ? (PROMO_CODES[activePromo] ?? null) : null;

  const tierOrder: Array<SubscriptionTier> = [null, "splits", "pro", "node_auditor"];
  const effectiveTier: SubscriptionTier =
    tierOrder.indexOf(promoTier) > tierOrder.indexOf(userTier) ? promoTier : userTier;

  const hasSplits = effectiveTier !== null;
  const isPro = effectiveTier === "pro" || effectiveTier === "node_auditor";

  const setTier = (t: SubscriptionTier) => setUserTier(t);
  const setIsPro = (value: boolean) => setUserTier(value ? "pro" : null);

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
      isPro,
      setTier,
      setIsPro,
      usedFreeSplit,
      setUsedFreeSplit,
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
