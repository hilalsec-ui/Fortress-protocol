/**
 * @file rpcManager.ts
 * @description Smart RPC Connection Manager for Fortress Protocol
 * 
 * Routes requests to appropriate RPC endpoints based on operation type:
 * - UX: Helius Beta (Fastest for write operations)
 * - POLLING: Helius Standard (Balanced for background polling)
 * - FREE: Solana Public (Conserves Helius credits for wallet queries)
 * 
 * Implements hybrid fallback logic:
 * - Primary RPC with 429/timeout handling
 * - Automatic retry with exponential backoff
 * - Fallback to Solana public RPC on failure
 * 
 * Purpose: Maximize Helius free tier throughput (1,000 req/min) while
 * minimizing per-operation credit waste on non-critical queries.
 */

import { Connection, RpcResponseAndContext } from "@solana/web3.js";

// RPC Endpoints — from environment variables
const RPC_UX = process.env.NEXT_PUBLIC_RPC_UX || "https://beta.helius-rpc.com";
const RPC_STABLE = process.env.NEXT_PUBLIC_RPC_STABLE || "https://mainnet.helius-rpc.com";
const RPC_PUBLIC = process.env.NEXT_PUBLIC_RPC_PUBLIC || "https://api.mainnet-beta.solana.com";

// Connection pool — reuse connections across the app
const connectionPool: Map<string, Connection> = new Map();

/**
 * Type of RPC operation — determines which endpoint to use
 * - 'UX': Buy/Draw transactions (write-heavy) → Helius Beta (fastest)
 * - 'POLLING': Background timer updates (read-heavy) → Helius Standard
 * - 'FREE': Wallet balance, token metadata → Solana Public (saves credits)
 */
export type RpcOperationType = "UX" | "POLLING" | "FREE";

// Get cached connection or create new one
function getConnection(url: string): Connection {
  if (!connectionPool.has(url)) {
    connectionPool.set(url, new Connection(url, "confirmed"));
  }
  return connectionPool.get(url)!;
}

/**
 * Get the appropriate RPC endpoint for this operation type
 */
function getEndpointForType(type: RpcOperationType): string {
  switch (type) {
    case "UX":
      return RPC_UX;
    case "POLLING":
      return RPC_STABLE;
    case "FREE":
      return RPC_PUBLIC;
  }
}

/**
 * Determines if an error is worth retrying (429, timeout, network error)
 */
function isRetryableError(err: any): boolean {
  const errorStr = err?.message?.toLowerCase?.() || err?.toString?.().toLowerCase?.() || "";
  const errorCode = err?.status || 0;

  // 429 (Rate Limit), 5xx (Server Error), network timeouts
  return (
    errorCode === 429 ||
    errorCode >= 500 ||
    errorStr.includes("429") ||
    errorStr.includes("rate") ||
    errorStr.includes("timeout") ||
    errorStr.includes("econnrefused") ||
    errorStr.includes("enotfound")
  );
}

/**
 * Wraps an async function with retry logic and fallback
 * 
 * @param operation Async function to execute (will receive a Connection object)
 * @param type Operation type (UX, POLLING, FREE)
 * @param maxRetries Number of retries on primary RPC
 * @returns Result from RPC call
 * 
 * Flow:
 * 1. Try primary endpoint with exponential backoff on 429
 * 2. On failure, fallback to Solana public RPC once
 * 3. If fallback fails, throw error
 */
export async function withFortressRpc<T>(
  operation: (conn: Connection) => Promise<T>,
  type: RpcOperationType = "POLLING",
  maxRetries = 3
): Promise<T> {
  const primaryEndpoint = getEndpointForType(type);
  const primaryConnection = getConnection(primaryEndpoint);

  try {
    return await withRetryLogic(
      () => operation(primaryConnection),
      primaryEndpoint,
      maxRetries
    );
  } catch (primaryErr) {
    // Check if error is retryable and not already on public RPC
    if (isRetryableError(primaryErr) && primaryEndpoint !== RPC_PUBLIC) {
      console.warn(
        `[RPC] Primary (${primaryEndpoint}) failed: ${(primaryErr as any)?.message}. ` +
          `Falling back to Solana public RPC...`
      );

      const fallbackConnection = getConnection(RPC_PUBLIC);
      try {
        return await withRetryLogic(
          () => operation(fallbackConnection),
          RPC_PUBLIC,
          1 // Single retry on fallback
        );
      } catch (fallbackErr) {
        console.error(
          `[RPC] Both primary and fallback RPCs failed for operation type '${type}'`,
          fallbackErr
        );
        throw fallbackErr;
      }
    }

    throw primaryErr;
  }
}

/**
 * Internal retry logic with exponential backoff
 */
async function withRetryLogic<T>(
  fn: () => Promise<T>,
  endpoint: string,
  maxRetries: number
): Promise<T> {
  const baseDelayMs = 800;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = isRetryableError(err);
      const isLastAttempt = attempt === maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.debug(
        `[RPC] ${endpoint} — retry ${attempt + 1}/${maxRetries} after ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("Retry logic exhausted");
}

/**
 * Get a Fortress-optimized Connection object for a specific operation type
 * 
 * @param type 'UX' (fastest writes), 'POLLING' (balanced), 'FREE' (public)
 * @returns Connection object configured to the appropriate endpoint
 */
export function getFortressConnection(type: RpcOperationType): Connection {
  const endpoint = getEndpointForType(type);
  return getConnection(endpoint);
}

/**
 * Common RPC operations wrapped with smart routing
 */

export async function fortressGetBalance(
  pubkey: string
): Promise<number> {
  return withFortressRpc(
    (conn) => conn.getBalance(new (require("@solana/web3.js").PublicKey)(pubkey)),
    "FREE"
  );
}

export async function fortressGetAccountInfo(
  pubkey: string,
  type: RpcOperationType = "POLLING"
): Promise<any | null> {
  return withFortressRpc(
    (conn) => conn.getAccountInfo(new (require("@solana/web3.js").PublicKey)(pubkey), "confirmed"),
    type
  );
}

export async function fortressGetMultipleAccountsInfo(
  pubkeys: string[],
  type: RpcOperationType = "POLLING"
): Promise<any[]> {
  return withFortressRpc(
    (conn) =>
      conn.getMultipleAccountsInfo(
        pubkeys.map((pk) => new (require("@solana/web3.js").PublicKey)(pk)),
        "confirmed"
      ),
    type
  );
}

export async function fortressGetTokenAccountBalance(
  tokenAccountAddress: string,
  type: RpcOperationType = "POLLING"
): Promise<any> {
  return withFortressRpc(
    (conn) =>
      conn.getTokenAccountBalance(
        new (require("@solana/web3.js").PublicKey)(tokenAccountAddress)
      ),
    type
  );
}

/**
 * Send a transaction — uses UX (Helius Beta) for fastest confirmation
 */
export async function fortressSendRawTransaction(
  rawTransaction: Buffer | Uint8Array
): Promise<string> {
  return withFortressRpc(
    (conn) => conn.sendRawTransaction(rawTransaction, { skipPreflight: true }),
    "UX", // Fastest endpoint for user-facing transactions
    2
  );
}
