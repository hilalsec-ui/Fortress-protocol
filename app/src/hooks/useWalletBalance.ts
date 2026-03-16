import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getFortressConnection } from "@/utils/rpcManager";

/**
 * Custom hook to fetch and monitor wallet balance with refresh capability
 *
 * Uses getFortressConnection('FREE') — routes to Solana public RPC to
 * conserve Helius free tier credits for logic-heavy operations like
 * transaction signing and draw processing.
 *
 * @returns Wallet balance and refresh function
 */
export function useWalletBalance() {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch current wallet balance using public RPC (saves Helius credits)
   */
  const fetchBalance = async () => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use public RPC via smart routing — routes to Solana public for 'FREE' operations
      const freeConnection = getFortressConnection("FREE");
      const balanceInLamports = await freeConnection.getBalance(publicKey);
      const balanceInSol = balanceInLamports / 1e9; // Convert lamports to SOL

      setBalance(balanceInSol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balance");
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Refresh balance with a delay to ensure transaction finalization
   * @param delayMs Delay in milliseconds before refreshing
   */
  const refreshBalance = (delayMs: number = 2000) => {
    setTimeout(() => {
      fetchBalance();
    }, delayMs);
  };

  // Fetch balance initially when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setBalance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey?.toString()]);

  return {
    balance,
    isLoading,
    error,
    refreshBalance,
    fetchBalance, // Expose manual fetch for immediate updates
  };
}
