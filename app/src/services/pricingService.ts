import { PublicKey } from '@solana/web3.js';
import { BN, Program } from '@coral-xyz/anchor';

// PricingConfig PDA Seeds
const PRICING_CONFIG_SEED = Buffer.from('pricing_config');

// Fallback rate used when PDA is not yet initialized or unreachable: 0.5 FPT per USD
export const FALLBACK_FPT_TO_USD_RATE = new BN(500_000);

// Retry with exponential backoff on 429
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, baseMs = 600): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 =
        err?.message?.includes?.('429') || err?.status === 429 || String(err).includes('429');
      if (!is429 || attempt === maxRetries) throw err;
      const delay = baseMs * Math.pow(2, attempt);
      console.warn(`[PricingService] 429 — retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('withRetry exhausted');
}

/**
 * Derives the PricingConfig PDA address
 */
export function getPricingConfigPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PRICING_CONFIG_SEED],
    programId
  );
}

/**
 * Fetches the current pricing configuration from the on-chain PDA.
 * Retries on 429 with exponential backoff.
 * Falls back to the default rate (0.5 FPT/USD) if the account is not yet
 * initialized or unreachable — never throws so callers don't crash.
 */
export async function fetchPricingConfig(program: Program) {
  const [pricingConfigPDA] = getPricingConfigPDA(program.programId);

  try {
    const pricingConfig = await withRetry<any>(() =>
      (program.account as any).pricingConfig.fetch(pricingConfigPDA)
    );

    return {
      pda: pricingConfigPDA,
      fptToUsdRate: pricingConfig.fptToUsdRate as BN,
      useOracle: pricingConfig.useOracle as boolean,
      oracleStalenessThreshold: pricingConfig.oracleStalenessThreshold as BN,
      lastUpdated: pricingConfig.lastUpdated as BN,
      bump: pricingConfig.bump as number,
      usingFallback: false,
    };
  } catch (error: any) {
    const is429 = error?.message?.includes?.('429') || String(error).includes('429');
    const isNotExist = error?.message?.includes?.('Account does not exist') ||
      error?.message?.includes?.('could not find account');

    if (is429) {
      console.warn('[PricingService] Rate-limited after retries — using fallback rate (0.5 FPT/USD)');
    } else if (isNotExist) {
      console.warn('[PricingService] PricingConfig PDA not yet initialized — using fallback rate (0.5 FPT/USD)');
    } else {
      console.warn('[PricingService] Could not fetch PricingConfig, using fallback rate:', error?.message);
    }

    // Return a safe default — the on-chain program accepts this rate
    return {
      pda: pricingConfigPDA,
      fptToUsdRate: FALLBACK_FPT_TO_USD_RATE,
      useOracle: false,
      oracleStalenessThreshold: new BN(0),
      lastUpdated: new BN(0),
      bump: 0,
      usingFallback: true,
    };
  }
}

/**
 * Calculates the required FPT amount for a given USD price
 * Formula: required_fpt = (tier_usd_price * fpt_to_usd_rate) / 10^6
 * 
 * @param tierUsdPrice - The tier price in USD (e.g., 5, 10, 15, 20, 50)
 * @param fptToUsdRate - The exchange rate from PricingConfig (e.g., 500000 = 0.5 FPT per USD)
 * @param quantity - Number of tickets (default 1)
 * @returns Required FPT amount in base units (with 6 decimals)
 */
export function calculateRequiredFPT(
  tierUsdPrice: number,
  fptToUsdRate: BN,
  quantity: number = 1
): BN {
  // Convert tier price to base units (USD has 6 decimals)
  const tierPriceBaseUnits = new BN(tierUsdPrice * 1_000_000);
  
  // Calculate: (tier_price * rate) / 10^6
  const requiredFptPerTicket = tierPriceBaseUnits
    .mul(fptToUsdRate)
    .div(new BN(1_000_000));
  
  // Multiply by quantity
  const totalRequiredFpt = requiredFptPerTicket.mul(new BN(quantity));
  return totalRequiredFpt;
}

/**
 * Calculates max FPT amount with slippage protection
 * 
 * @param requiredFpt - The exact FPT amount needed
 * @param slippageBps - Slippage tolerance in basis points (100 = 1%, 1000 = 10%)
 * @returns Max FPT amount allowing for slippage
 */
export function calculateMaxFptAmount(requiredFpt: BN, slippageBps: number = 1000): BN {
  // Add slippage: max_amount = required * (10000 + slippage_bps) / 10000
  const maxAmount = requiredFpt
    .mul(new BN(10000 + slippageBps))
    .div(new BN(10000));
  return maxAmount;
}

/**
 * Converts FPT base units to human-readable format
 */
export function formatFPT(fptBaseUnits: BN | number): string {
  const amount = typeof fptBaseUnits === 'number' 
    ? fptBaseUnits 
    : fptBaseUnits.toNumber();
  
  return (amount / 1_000_000).toFixed(2);
}

/**
 * Converts human-readable FPT to base units
 */
export function parseFPT(fptAmount: number): BN {
  return new BN(Math.floor(fptAmount * 1_000_000));
}
