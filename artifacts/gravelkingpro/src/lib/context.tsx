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

interface AppState {
  isPro: boolean;
  setIsPro: (value: boolean) => void;
  results: Results;
  setResults: (results: Results) => void;
  hasRun: boolean;
  setHasRun: (hasRun: boolean) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [results, setResults] = useState<Results>(null);
  const [hasRun, setHasRun] = useState(false);

  // Sync isPro from authenticated user's DB record
  useEffect(() => {
    if (!isLoading && user?.isPro) {
      setIsPro(true);
    }
  }, [user, isLoading]);

  return (
    <AppContext.Provider value={{ isPro, setIsPro, results, setResults, hasRun, setHasRun }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used within AppProvider");
  return context;
}
