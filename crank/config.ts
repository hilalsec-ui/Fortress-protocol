/**
 * @file config.ts
 * @description Crank configuration loader with security validation
 *
 * Ensures all required environment variables are:
 *   • Loaded from .env (via dotenv)
 *   • Validated (not empty, proper format)
 *   • Logged securely (no secrets printed)
 *
 * Fails fast at startup if critical variables missing.
 */

import * as dotenv from 'dotenv';

// Load .env file into process.env
dotenv.config();

export interface CrankConfig {
  // Helius RPC
  heliusApiKey: string;
  rpcUrl: string;
  rpcFallback: string;
  rpcTimeoutMs: number;
  rpcMaxRetries: number;
  rpcRetryDelayMs: number;

  // Crank wallet
  crankPrivateKey?: string;
  anchorWallet?: string;

  // Optional features
  lotteryType?: string;
  tier?: number;
  nodeEnv: 'development' | 'production';
  crankBalanceWarningSol: number;
}

/**
 * Load and validate crank configuration
 * Throws error if critical variables are missing
 */
export function loadConfig(): CrankConfig {
  const errors: string[] = [];

  // ── Validate Helius API Key ────────────────────────────────────────────────

  const heliusApiKey = process.env.HELIUS_API_KEY?.trim();
  if (!heliusApiKey) {
    errors.push(
      '❌ HELIUS_API_KEY is missing or empty\n' +
      '   Add to crank/.env: HELIUS_API_KEY=your-api-key-from-helius-dashboard\n' +
      '   Get free key: https://dashboard.helius.dev'
    );
  } else if (heliusApiKey.length < 10) {
    errors.push('❌ HELIUS_API_KEY is too short — check it was copied correctly');
  }

  // ── Validate RPC URL ───────────────────────────────────────────────────────

  let rpcUrl = process.env.RPC_URL?.trim();
  if (!rpcUrl) {
    // Try to construct from API key
    if (heliusApiKey) {
      rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    } else {
      errors.push('❌ RPC_URL is missing and cannot be constructed without HELIUS_API_KEY');
    }
  }

  if (rpcUrl && !rpcUrl.includes('helius-rpc.com') && !rpcUrl.includes('api.mainnet-beta.solana.com')) {
    errors.push('⚠️  RPC_URL does not appear to be Helius or Solana public RPC — check it');
  }

  // ── Validate Crank Private Key ─────────────────────────────────────────────

  const crankPrivateKey = process.env.CRANK_PRIVATE_KEY?.trim();
  const anchorWallet = process.env.ANCHOR_WALLET?.trim();

  if (!crankPrivateKey && !anchorWallet) {
    errors.push(
      '❌ CRANK_PRIVATE_KEY or ANCHOR_WALLET is missing\n' +
      '   Option 1: Add to crank/.env: CRANK_PRIVATE_KEY=<base58-or-json>\n' +
      '   Option 2: Add to crank/.env: ANCHOR_WALLET=/path/to/keypair.json'
    );
  }

  // Validate format if Base58 provided
  if (crankPrivateKey && !crankPrivateKey.startsWith('[')) {
    // Looks like Base58 — basic validation
    if (crankPrivateKey.length < 80 || crankPrivateKey.length > 90) {
      errors.push('⚠️  CRANK_PRIVATE_KEY Base58 length looks wrong — check it was copied fully');
    }
  }

  // ── Validate RPC Timeouts ──────────────────────────────────────────────────

  const rpcTimeoutMs = process.env.RPC_TIMEOUT_MS
    ? parseInt(process.env.RPC_TIMEOUT_MS, 10)
    : 30000;

  if (isNaN(rpcTimeoutMs) || rpcTimeoutMs < 1000) {
    errors.push('❌ RPC_TIMEOUT_MS is invalid — must be >= 1000 (1 second)');
  }

  const rpcMaxRetries = process.env.RPC_MAX_RETRIES
    ? parseInt(process.env.RPC_MAX_RETRIES, 10)
    : 3;

  if (isNaN(rpcMaxRetries) || rpcMaxRetries < 1) {
    errors.push('❌ RPC_MAX_RETRIES is invalid — must be >= 1');
  }

  const rpcRetryDelayMs = process.env.RPC_RETRY_DELAY_MS
    ? parseInt(process.env.RPC_RETRY_DELAY_MS, 10)
    : 2000;

  if (isNaN(rpcRetryDelayMs) || rpcRetryDelayMs < 100) {
    errors.push('❌ RPC_RETRY_DELAY_MS is invalid — must be >= 100');
  }

  // ── Validate Optional Vault Targeting ──────────────────────────────────────

  let lotteryType: string | undefined;
  let tier: number | undefined;

  if (process.env.LOTTERY_TYPE) {
    lotteryType = process.env.LOTTERY_TYPE.toUpperCase();
    if (!['LPM', 'DPL', 'WPL', 'MPL'].includes(lotteryType)) {
      errors.push(`❌ LOTTERY_TYPE '${lotteryType}' is invalid — must be LPM, DPL, WPL, or MPL`);
    }
  }

  if (process.env.TIER) {
    tier = parseInt(process.env.TIER, 10);
    if (isNaN(tier) || tier < 1) {
      errors.push('❌ TIER is invalid — must be a positive number');
    }
  }

  // ── Validate Node Environment ──────────────────────────────────────────────

  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production';
  if (!['development', 'production'].includes(nodeEnv)) {
    errors.push(`⚠️  NODE_ENV '${nodeEnv}' is unusual — expected 'development' or 'production'`);
  }

  // ── Validate Balance Warning ───────────────────────────────────────────────

  const crankBalanceWarningSol = process.env.CRANK_BALANCE_WARNING_SOL
    ? parseFloat(process.env.CRANK_BALANCE_WARNING_SOL)
    : 0.05;

  if (isNaN(crankBalanceWarningSol) || crankBalanceWarningSol < 0.001) {
    errors.push('❌ CRANK_BALANCE_WARNING_SOL is invalid — must be positive');
  }

  // ── Fail Fast if Errors ────────────────────────────────────────────────────

  if (errors.length > 0) {
    console.error('\n❌ Configuration validation failed:\n');
    errors.forEach(err => {
      console.error(`   ${err}`);
    });
    console.error('\n📖 See crank/.env for setup instructions\n');
    process.exit(1);
  }

  // At this point, heliusApiKey and rpcUrl are guaranteed to exist
  const finalApiKey = heliusApiKey!;
  const finalRpcUrl = rpcUrl || `https://mainnet.helius-rpc.com/?api-key=${finalApiKey}`;

  // ── Log Configuration (securely, no secrets) ───────────────────────────────

  console.log('\n✅ Configuration loaded');
  console.log(`   RPC: ${finalRpcUrl.substring(0, 50)}…`);
  console.log(`   API Key: ${finalApiKey.substring(0, 8)}…${finalApiKey.substring(finalApiKey.length - 4)}`);
  console.log(`   Timeout: ${rpcTimeoutMs}ms | Retries: ${rpcMaxRetries} | Retry delay: ${rpcRetryDelayMs}ms`);
  if (lotteryType && tier) {
    console.log(`   Targeted: ${lotteryType} $${tier}`);
  } else {
    console.log(`   Mode: All 16 vaults`);
  }
  console.log(`   Env: ${nodeEnv}`);
  console.log('');

  return {
    heliusApiKey: finalApiKey,
    rpcUrl: finalRpcUrl,
    rpcFallback: process.env.RPC_FALLBACK || 'https://api.mainnet-beta.solana.com',
    rpcTimeoutMs,
    rpcMaxRetries,
    rpcRetryDelayMs,
    crankPrivateKey,
    anchorWallet,
    lotteryType,
    tier,
    nodeEnv,
    crankBalanceWarningSol,
  };
}

// Load config immediately when this module is imported
export const CONFIG = loadConfig();
