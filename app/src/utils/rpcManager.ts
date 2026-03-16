/**
 * @file rpcManager.ts
 * @description Smart RPC Connection Manager for Fortress Protocol — "Three Pipes" Strategy
 * 
 * Routes requests to the most appropriate RPC endpoint based on operation type:
 * - Gatekeeper: Helius Beta (fastest for user transactions)
 * - Standard: Helius Standard (balanced for background polling)
 * - Free: Solana Public (conserves Helius credits for non-critical reads)
 * 
 * Implements hybrid fallback logic:
 * - Primary RPC with 429/timeout handling
 * - Automatic retry with exponential backoff
 * - Fallback to Solana public RPC on failure
 * 
 * Purpose: Maximize Helius free tier throughput (1,000 req/min) while
 * minimizing per-operation credit waste and ensuring reliability.
 */

import { Connection, RpcResponseAndContext } from "@solana/web3.js";

// Three-Pipe RPC Endpoints — from environment variables
const RPC_GATEKEEPER = process.env.NEXT_PUBLIC_RPC_GATEKEEPER || "https://beta.helius-rpc.com";
const RPC_STANDARD = process.env.NEXT_PUBLIC_RPC_STANDARD || "https://mainnet.helius-rpc.com";
const RPC_FREE = process.env.NEXT_PUBLIC_RPC_PUBLIC || "https://api.mainnet-beta.solana.com";

// Connection pool — reuse connections across the app
const connectionPool: Map<string, Connection> = new Map();

/**
 * Type of RPC operation — determines which endpoint ("pipe") to use
 * - 'GATEKEEPER': Buy/Draw transactions (write-heavy, user-facing) → Helius Beta (fastest)
 * - 'STANDARD': Background polling, 16-tier data fetching, crank tasks → Helius Standard
 * - 'FREE': Wallet balance, token metadata → Solana Public (saves credits)
 */
export type RpcPipeType = "GATEKEEPER" | "STANDARD" | "FREE";

// Get cached connection or create new one
function getConnection(url: string): Connection {
  if (!connectionPool.has(url)) {
    connectionPool.set(url, new Connection(url, "confirmed"));
  }
  return connectionPool.get(url)!;
}

/**
 * Get the appropriate RPC endpoint for this operation type ("pipe")
 */
function getEndpointForPipe(pipe: RpcPipeType): string {
  switch (pipe) {
    case "GATEKEEPER":
      return RPC_GATEKEEPER;
    case "STANDARD":
      return RPC_STANDARD;
    case "FREE":
      return RPC_FREE;
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
 * @param pipe Operation type (GATEKEEPER, STANDARD, FREE)
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
  pipe: RpcPipeType = "STANDARD",
  maxRetries = 3
): Promise<T> {
  const primaryEndpoint = getEndpointForPipe(pipe);
  const primaryConnection = getConnection(primaryEndpoint);

  try {
    return await withRetryLogic(
      () => operation(primaryConnection),
      primaryEndpoint,
      maxRetries
    );
  } catch (primaryErr) {
    // Check if error is retryable and not already on public RPC
    if (isRetryableError(primaryErr) && primaryEndpoint !== RPC_FREE) {
      console.warn(
        `[RPC] Primary (${pipe} pipe: ${primaryEndpoint}) failed: ${(primaryErr as any)?.message}. ` +
          `Falling back to Solana public RPC...`
      );

      const fallbackConnection = getConnection(RPC_FREE);
      try {
        return await withRetryLogic(
          () => operation(fallbackConnection),
          RPC_FREE,
          1 // Single retry on fallback
        );
      } catch (fallbackErr) {
        console.error(
          `[RPC] Both primary (${pipe}) and fallback RPCs failed for operation`,
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
 * Get a Fortress-optimized Connection object for a specific operation type ("pipe")
 * 
 * @param pipe 'GATEKEEPER' (fastest), 'STANDARD' (balanced), 'FREE' (cheap)
 * @returns Connection object configured to the appropriate endpoint
 */
export function getFortressConnection(pipe: RpcPipeType): Connection {
  const endpoint = getEndpointForPipe(pipe);
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
  pipe: RpcPipeType = "STANDARD"
): Promise<any | null> {
  return withFortressRpc(
    (conn) => conn.getAccountInfo(new (require("@solana/web3.js").PublicKey)(pubkey), "confirmed"),
    pipe
  );
}

export async function fortressGetMultipleAccountsInfo(
  pubkeys: string[],
  pipe: RpcPipeType = "STANDARD"
): Promise<any[]> {
  return withFortressRpc(
    (conn) =>
      conn.getMultipleAccountsInfo(
        pubkeys.map((pk) => new (require("@solana/web3.js").PublicKey)(pk)),
        "confirmed"
      ),
    pipe
  );
}

export async function fortressGetTokenAccountBalance(
  tokenAccountAddress: string,
  pipe: RpcPipeType = "STANDARD"
): Promise<any> {
  return withFortressRpc(
    (conn) =>
      conn.getTokenAccountBalance(
        new (require("@solana/web3.js").PublicKey)(tokenAccountAddress)
      ),
    pipe
  );
}

/**
 * Send a transaction — uses GATEKEEPER (Helius Beta) for fastest confirmation
 */
export async function fortressSendRawTransaction(
  rawTransaction: Buffer | Uint8Array
): Promise<string> {
  return withFortressRpc(
    (conn) => conn.sendRawTransaction(rawTransaction, { skipPreflight: true }),
    "GATEKEEPER", // Fastest endpoint for user-facing transactions
    2
  );
}
