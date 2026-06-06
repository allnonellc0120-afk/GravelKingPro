import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

interface AppState {
  /** subscriptionTier is the authoritative tier value */
  tier: SubscriptionTier;
  /** hasSplits: any paid tier — unlocks voice removal + stem splitting downloads */
  hasSplits: boolean;
  /** isPro: Pro or Node Auditor — unlocks full Audio Studio + everything in Splits */
  isPro: boolean;
  setTier: (tier: SubscriptionTier) => void;
  /** Legacy setter — still used by old Stripe success handler; maps to tier */
  setIsPro: (value: boolean) => void;
  results: Results;
  setResults: (results: Results) => void;
  hasRun: boolean;
  setHasRun: (hasRun: boolean) => void;
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
  const [tier, setTierState] = useState<SubscriptionTier>(null);
  const [results, setResults] = useState<Results>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      setTierState(tierFromUser(user.subscriptionTier, user.isPro));
    } else if (!isLoading && !user) {
      setTierState(null);
    }
  }, [user, isLoading]);

  const hasSplits = tier !== null;
  const isPro = tier === "pro" || tier === "node_auditor";

  const setTier = (t: SubscriptionTier) => setTierState(t);
  const setIsPro = (value: boolean) => setTierState(value ? "pro" : null);

  return (
    <AppContext.Provider value={{ tier, hasSplits, isPro, setTier, setIsPro, results, setResults, hasRun, setHasRun }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used within AppProvider");
  return context;
}
