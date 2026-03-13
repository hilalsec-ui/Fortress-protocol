"use client";

import { useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { initializeSolanaHeartbeat } from "@/services/solanaHeartbeat";

/**
 * Solana Heartbeat Initializer Component
 * 
 * This component initializes the global "Drift-Proof Global Sync" heartbeat service,
 * which synchronizes the UI to Solana blockchain time every 60 seconds.
 * 
 * Should be placed in the root layout to ensure the service starts with the app.
 */
export function SolanaHeartbeatInitializer() {
  const { connection } = useConnection();

  useEffect(() => {
    if (!connection) {
      console.debug("[Heartbeat Initializer] No connection available yet");
      return;
    }

    try {
      console.debug("[Heartbeat Initializer] Initializing with connection:", connection.rpcEndpoint);
      initializeSolanaHeartbeat(connection);
    } catch (error) {
      console.error("[Heartbeat Initializer] Failed to initialize:", error);
    }
  }, [connection]);

  return null; // This component doesn't render anything
}
