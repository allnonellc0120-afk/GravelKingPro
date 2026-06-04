import { createContext, useContext, useState, ReactNode } from "react";

type Results = {
  throughput: string;
  stability: string;
  efficiency: string;
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
  const [isPro, setIsPro] = useState(false);
  const [results, setResults] = useState<Results>(null);
  const [hasRun, setHasRun] = useState(false);

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
