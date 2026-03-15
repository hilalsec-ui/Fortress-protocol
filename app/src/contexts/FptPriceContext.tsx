"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchFptUsdPrice, DEFAULT_FPT_PER_USD } from "@/services/switchboardPriceService";

interface FptPriceState {
  /** Current SOL price in USD */
  solUsd: number;
  /** Current FPT price in USD (oracle-implied) */
  fptUsd: number;
  /** FPT base units per $1 USD (6 decimal, e.g. 500_000 = 0.5 FPT/$) */
  fptPerUsd6dec: number;
  /**
   * Live FPT/USD market price from Jupiter DEX.
   * null = token has no liquidity / no DEX market yet.
   */
  fptMarketUsd: number | null;
  /** True while the first fetch is in progress */
  isLoading: boolean;
  /** Last successful refresh timestamp (ms) */
  lastUpdatedAt: number;
}

const DEFAULT_STATE: FptPriceState = {
  solUsd: 0,
  fptUsd: 1_000_000 / DEFAULT_FPT_PER_USD,
  fptPerUsd6dec: DEFAULT_FPT_PER_USD,
  fptMarketUsd: null,
  isLoading: true,
  lastUpdatedAt: 0,
};

const FptPriceContext = createContext<FptPriceState>(DEFAULT_STATE);

export function FptPriceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FptPriceState>(DEFAULT_STATE);

  const refresh = useCallback(async () => {
    try {
      const { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd } = await fetchFptUsdPrice();
      setState({ solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd, isLoading: false, lastUpdatedAt: Date.now() });
    } catch {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return <FptPriceContext.Provider value={state}>{children}</FptPriceContext.Provider>;
}

/** Hook to consume the live FPT price in any component. */
export function useFptPrice(): FptPriceState {
  return useContext(FptPriceContext);
}
