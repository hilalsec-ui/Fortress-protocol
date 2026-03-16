"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { useAnchorProgram } from "@/utils/anchor";
import { fetchAllLotteryAccounts } from "@/services/lotteryService";
import { useTimeOffsetStore } from "@/stores/timeOffsetStore";
import { getFortressConnection, withFortressRpc } from "@/utils/rpcManager";
import {
  PROGRAM_ID,
  FPT_MINT,
  TOKEN_2022_PROGRAM_ID,
  FPT_DECIMALS,
} from "@/utils/constants";

// ── Constants ──────────────────────────────────────────────────────────────────

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);

const [SOL_VAULT_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("sol_vault")],
  PROGRAM_PUBKEY
);

// Base polling interval (ms) — jitter added per request to prevent synchronized spikes
const POLL_BASE_MS = 20_000; // 20s — was 10s, now with jitter formula
const JITTER_MAX_MS = 500; // Random 0-500ms added to base

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChainDataContextType {
  /** All 4 lottery types with per-tier vault data from fetchAllLotteryAccounts */
  lotteryAccounts: any[] | null;
  /** SOL balance of the sol_vault PDA */
  treasurySol: number | null;
  /** FPT balance of the sol_vault ATA */
  treasuryFpt: number | null;
  /** True only on the very first load before any data is available */
  isLoading: boolean;
  /** Timestamp of last successful fetch */
  lastRefresh: Date | null;
  /** Force an immediate re-fetch (call after transactions) */
  refresh: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ChainDataContext = createContext<ChainDataContextType>({
  lotteryAccounts: null,
  treasurySol: null,
  treasuryFpt: null,
  isLoading: true,
  lastRefresh: null,
  refresh: () => {},
});

export function useChainData() {
  return useContext(ChainDataContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ChainDataProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const program = useAnchorProgram();

  const [lotteryAccounts, setLotteryAccounts] = useState<any[] | null>(null);
  const [treasurySol, setTreasurySol] = useState<number | null>(null);
  const [treasuryFpt, setTreasuryFpt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const isFetchingRef = useRef(false);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAll = useCallback(
    async (silent = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (!silent) setIsLoading(true);

      try {
        // Use smart RPC manager for polling — routes to Helius Standard endpoint
        // with automatic 429 fallback to public RPC
        const pollingConnection = getFortressConnection("STANDARD");

        // All RPC reads fire in parallel — one combined network burst per cycle
        // Batch SOL vault balance + Clock sysvar into ONE getMultipleAccountsInfo call
        // so we get Solana unix_timestamp (exact match with Rust Clock::get())
        // without an extra RPC round-trip — total RPC count stays at 3 per poll cycle.
        const [accountsResult, vaultInfoResult, fptResult] =
          await Promise.allSettled([
            // 1. All 16 vault accounts — ONE batched getMultipleAccountsInfo call
            program
              ? withFortressRpc(
                  () => fetchAllLotteryAccounts(program),
                  "STANDARD"
                )
              : Promise.resolve(null),

            // 2. sol_vault SOL balance + Clock sysvar — batched into ONE call
            withFortressRpc(
              () =>
                pollingConnection.getMultipleAccountsInfo(
                  [SOL_VAULT_PDA, SYSVAR_CLOCK_PUBKEY],
                  "confirmed"
                ),
              "STANDARD"
            ),

            // 3. FPT ATA balance (treasury page)
            withFortressRpc(
              async () => {
                const { getAssociatedTokenAddress } = await import(
                  "@solana/spl-token"
                );
                const ata = await getAssociatedTokenAddress(
                  new PublicKey(FPT_MINT),
                  SOL_VAULT_PDA,
                  true, // allowOwnerOffCurve — PDA is off-curve
                  new PublicKey(TOKEN_2022_PROGRAM_ID)
                );
                const info = await pollingConnection.getTokenAccountBalance(ata);
                return (
                  parseFloat(info.value.amount) / Math.pow(10, FPT_DECIMALS)
                );
              },
              "STANDARD"
            ),
          ]);

        // --- Lottery accounts ---
        if (accountsResult.status === "fulfilled" && accountsResult.value) {
          setLotteryAccounts(accountsResult.value);
        }

        // --- Treasury SOL + on-chain Clock sync ---
        if (vaultInfoResult.status === "fulfilled" && vaultInfoResult.value) {
          const [solVaultInfo, clockInfo] = vaultInfoResult.value;

          // SOL balance from account lamports
          if (solVaultInfo) {
            setTreasurySol(solVaultInfo.lamports / LAMPORTS_PER_SOL);
          }

          // Clock sysvar layout (little-endian):
          //   offset 0:  slot              (u64, 8 bytes)
          //   offset 8:  epoch_start_timestamp (i64, 8 bytes)
          //   offset 16: epoch             (u64, 8 bytes)
          //   offset 24: leader_schedule_epoch (u64, 8 bytes)
          //   offset 32: unix_timestamp    (i64, 8 bytes)  ← same as Rust Clock::get()?.unix_timestamp
          if (clockInfo && clockInfo.data.length >= 40) {
            const onChainTime = Number(clockInfo.data.readBigInt64LE(32));
            const localNow = Date.now() / 1000;
            useTimeOffsetStore.getState().setTimeOffset(onChainTime - localNow);
          }
        }

        // --- FPT balance ---
        if (fptResult.status === "fulfilled") {
          setTreasuryFpt(fptResult.value);
        } else {
          setTreasuryFpt(0); // ATA may not exist yet
        }

        setLastRefresh(new Date());
      } catch (err) {
        console.error("[ChainDataContext] fetchAll error:", err);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    },
    [program, connection]
  );

  // Initial fetch on mount / when program becomes available
  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  // Polling with jitter — recursive setTimeout instead of setInterval
  // Formula: interval = base_time + (Math.random() * 500)
  // Purpose: Prevents synchronized RPC spikes when multiple users load the site
  useEffect(() => {
    const schedulePoll = () => {
      // Add random jitter to spread polling across time
      const jitteredInterval = POLL_BASE_MS + Math.random() * JITTER_MAX_MS;
      
      pollTimeoutRef.current = setTimeout(() => {
        fetchAll(true); // silent fetch
        schedulePoll(); // Schedule next poll recursively
      }, jitteredInterval);
    };

    schedulePoll();

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [fetchAll]);

  // ── Single global 1-second ticker ────────────────────────────────────────────
  // This is the ONLY setInterval for time in the entire app.
  // It drives useTimeOffsetStore.nowSeconds which every countdown timer subscribes
  // to via useTimeOffsetStore(s => s.nowSeconds). Because they all read the same
  // Zustand value they tick in perfect unison — including the hero CountdownTimer,
  // every tier card banner, and the homepage TierTimers badges.
  useEffect(() => {
    useTimeOffsetStore.getState().tickNow(); // fire immediately so nowSeconds ≠ 0 on first render
    const tickId = setInterval(() => useTimeOffsetStore.getState().tickNow(), 1000);
    return () => clearInterval(tickId);
  }, []);

  // Real-time treasury SOL balance — updates immediately on any lamport change
  useEffect(() => {
    const subId = connection.onAccountChange(
      SOL_VAULT_PDA,
      (accountInfo) => {
        const solBalance = accountInfo.lamports / LAMPORTS_PER_SOL;
        setTreasurySol(solBalance);
      },
      "confirmed"
    );
    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [connection]);

  const refresh = useCallback(() => {
    fetchAll(false);
  }, [fetchAll]);

  return (
    <ChainDataContext.Provider
      value={{
        lotteryAccounts,
        treasurySol,
        treasuryFpt,
        isLoading,
        lastRefresh,
        refresh,
      }}
    >
      {children}
    </ChainDataContext.Provider>
  );
}
