import { useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";

/**
 * Hook to listen for LowTreasuryWarning events and alert users
 * Alerts when treasury balance drops below 0.1 SOL
 */
export function useTreasuryWarnings(programId?: string) {
  useEffect(() => {
    const rpcEndpoint =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_ENDPOINT ||
      "https://api.devnet.solana.com";

    const connection = new Connection(rpcEndpoint);

    if (!programId) {
      console.warn(
        "useTreasuryWarnings: No programId provided, skipping listener"
      );
      return;
    }

    let isSubscribed = true;
    let subscriptionId: number | null = null;

    (async () => {
      try {
        subscriptionId = connection.onLogs(
          new PublicKey(programId),
          (logs) => {
            if (!isSubscribed) return;
            if (logs.err) return;

            // Listen for LowTreasuryWarning events
            const logString = logs.logs.join("\n");

            if (logString.includes("[WARNING] Treasury balance low")) {
              toast.error(
                "⚠️ Treasury balance critically low! Admin needs to refund the bounty reserve to keep draws functioning.",
                {
                  duration: 10000,
                }
              );
            }

            // Listen for successful bounty claims
            if (logString.includes("[BOUNTY_PAID]")) {
              const match = logString.match(
                /\[BOUNTY_PAID\] [\d.] (.*?) to keeper/
              );
              if (match) {
                toast.success("🎉 Keeper claimed draw reward!", {
                  duration: 4000,
                });
              }
            }
          }
        );
      } catch (err) {
        console.error("Failed to set up treasury warning listener:", err);
      }
    })();

    return () => {
      isSubscribed = false;
      if (subscriptionId !== null) {
        connection.removeOnLogsListener(subscriptionId);
      }
    };
  }, [programId]);
}
