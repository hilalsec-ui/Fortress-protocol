import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import idl from "../idl/fortress_protocol.json";
import { RPC_ENDPOINT } from "./constants";

// Stable read-only public key used when no wallet is connected.
// System Program address — always valid, never changes.
const READONLY_PUBKEY = new PublicKey("11111111111111111111111111111111");

/**
 * Custom hook to initialize and use the Anchor program
 * @returns Anchor Program instance or null if not initialized
 */
export function useAnchorProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    // Only require connection; wallet is optional for read-only account fetching
    if (!connection) {
      return null;
    }

    try {
      // Validate IDL
      if (!idl || typeof idl !== "object" || !(idl as any).instructions) {
        console.error("❌ IDL invalid");
        return null;
      }

      // Use real wallet when connected; fall back to read-only dummy for account reads
      const anchorWallet: Wallet = wallet.publicKey
        ? {
            publicKey: wallet.publicKey,
            signTransaction: async (tx: Transaction | VersionedTransaction) => {
              if (!wallet.signTransaction) {
                throw new Error("signTransaction not available");
              }
              return await wallet.signTransaction(tx);
            },
            signAllTransactions: async (
              txs: (Transaction | VersionedTransaction)[],
            ) => {
              if (!wallet.signAllTransactions) {
                throw new Error("signAllTransactions not available");
              }
              return await wallet.signAllTransactions(txs);
            },
          } as any
        : {
            // Read-only: can fetch accounts but cannot sign transactions
            publicKey: READONLY_PUBKEY,
            signTransaction: async (_tx: any) => {
              throw new Error("Wallet not connected");
            },
            signAllTransactions: async (_txs: any) => {
              throw new Error("Wallet not connected");
            },
          } as any;

      // Create provider with wallet
      const provider = new AnchorProvider(connection, anchorWallet, {
        commitment: "confirmed",
      });

      // Create program - Anchor v0.32+ uses (idl, provider) constructor
      // The program ID is taken from the IDL's "address" field
      const prog = new Program(idl as any, provider);

      return prog;
    } catch (error) {
      console.error("❌ Program init error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      return null;
    }
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  return program;
}

/**
 * Custom hook to get Solana connection
 * @returns Connection instance
 */
export function useConnection() {
  const connection = useMemo(() => {
    return new Connection(RPC_ENDPOINT, "confirmed");
  }, []);

  return { connection };
}

