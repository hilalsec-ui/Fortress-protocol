/**
 * switchboardPriceService.ts
 *
 * FPT ticket pricing via live SOL/USD from CoinGecko (primary) or Coinbase (fallback).
 *
 * On-chain formula (oracle.rs `compute_fpt_ticket_cost`):
 *   fpt_per_ticket = tier_usd × DEFAULT_FPT_PER_SOL × 10^12 / sol_usd_6dec
 *
 * Where sol_usd_6dec = solPriceUsd × 10^6, simplifying to:
 *   fptPerUsd6dec (µFPT per $1) = DEFAULT_FPT_PER_SOL × 10^12 / sol_usd_6dec
 *                                = 1000 × 10^12 / (solPrice × 10^6)
 *                                = 10^9 / solPrice
 *
 * Example: $5 tier @ $180 SOL → 5 × (10^9 / 180) ≈ 27,777,778 µFPT = 27.78 FPT
 */

// ── Constants mirroring oracle.rs ──────────────────────────────────────────
/** oracle.rs DEFAULT_FPT_PER_SOL */
const DEFAULT_FPT_PER_SOL = 1_000;
/** oracle.rs DEFAULT_SOL_USD_6DEC — fallback when all price sources unreachable */
const DEFAULT_SOL_USD_6DEC = 180_000_000; // $180.00
const DEFAULT_SOL_PRICE_USD = DEFAULT_SOL_USD_6DEC / 1_000_000; // 180

/** Default fptPerUsd6dec (µFPT per $1) at the $180 SOL fallback */
export const DEFAULT_FPT_PER_USD = Math.round(
  (DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / DEFAULT_SOL_USD_6DEC,
); // ≈ 5_555_556

/** Minimum fptPerUsd6dec — clamps display when SOL approaches $1 000 */
export const MIN_FPT_PER_USD = Math.round(
  (DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / 1_000_000_000,
); // = 1_000_000

/** FPT SPL mint address (mainnet) */
const FPT_MINT = '3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj';

// ── Cache ──────────────────────────────────────────────────────────────────────
let _cache: {
  solUsd: number;
  fptUsd: number;
  fptPerUsd6dec: number;
  fptMarketUsd: number | null;
  fetchedAt: number;
} | null = null;
const CACHE_TTL_MS = 30_000;

// ── fetch helpers ───────────────────────────────────────────────────────────────
async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSolUsd(): Promise<number | null> {
  // Primary: CoinGecko (free, no auth required)
  try {
    const res = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    );
    if (res.ok) {
      const data = await res.json();
      const price = data?.solana?.usd;
      if (typeof price === 'number' && price > 0) return price;
    }
  } catch { /* fall through */ }

  // Fallback: Coinbase
  try {
    const res = await fetchWithTimeout(
      'https://api.coinbase.com/v2/exchange-rates?currency=SOL',
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.rates?.USD);
      if (isFinite(price) && price > 0) return price;
    }
  } catch { /* fall through */ }

  return null;
}

/**
 * Fetch FPT's live market price from Jupiter Price API v2.
 * Returns null when there is no DEX market / liquidity for the token.
 */
async function fetchFptMarketPrice(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.jup.ag/price/v2?ids=${FPT_MINT}`,
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.[FPT_MINT]?.price);
      if (isFinite(price) && price > 0) return price;
    }
  } catch { /* no DEX market yet */ }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────────────

/**
 * Fetch live SOL/USD (for oracle-based ticket pricing) and FPT's DEX market
 * price (from Jupiter) in parallel.  fptMarketUsd is null when FPT has no
 * liquidity yet — callers must handle this case honestly in the UI.
 */
export async function fetchFptUsdPrice(): Promise<{
  solUsd: number;
  fptUsd: number;
  fptPerUsd6dec: number;
  fptMarketUsd: number | null;
}> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return {
      solUsd: _cache.solUsd,
      fptUsd: _cache.fptUsd,
      fptPerUsd6dec: _cache.fptPerUsd6dec,
      fptMarketUsd: _cache.fptMarketUsd,
    };
  }

  let solUsd6dec = DEFAULT_SOL_USD_6DEC;
  // Fetch SOL/USD and FPT DEX market price in parallel
  const [liveSolPrice, fptMarketUsd] = await Promise.all([
    fetchSolUsd(),
    fetchFptMarketPrice(),
  ]);

  if (liveSolPrice !== null) {
    solUsd6dec = Math.round(liveSolPrice * 1_000_000);
  } else {
    console.warn(`[SBPrice] All price sources failed — using fallback $${DEFAULT_SOL_PRICE_USD} SOL`);
  }

  // Exact mirror of oracle.rs compute_fpt_ticket_cost:
  //   µFPT per $1 = DEFAULT_FPT_PER_SOL × 10^12 / sol_usd_6dec
  const fptPerUsd6dec = Math.max(
    Math.round((DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / solUsd6dec),
    MIN_FPT_PER_USD,
  );
  // USD value of 1 FPT = sol_usd_6dec / (DEFAULT_FPT_PER_SOL × 10^6)
  const fptUsd = solUsd6dec / (DEFAULT_FPT_PER_SOL * 1_000_000);
  const solUsd = solUsd6dec / 1_000_000;

  _cache = { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd, fetchedAt: now };
  return { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd };
}

/**
 * Compute fpt_per_ticket (µFPT) for a given USD tier.
 * Direct mirror of on-chain: cost = tier_usd × fptPerUsd6dec
 */
export function computeFptPerTicket(
  tierUsd: number,
  fptPerUsd6dec: number,
): number {
  return Math.max(
    Math.round(tierUsd * fptPerUsd6dec),
    tierUsd * MIN_FPT_PER_USD,
  );
}

/**
 * max_fpt_amount = fptPerTicket × quantity × (1 + slippageBps / 10_000)
 * Default 1000 bps = 10% slippage tolerance.
 */
export function computeMaxFptAmount(
  fptPerTicket: number,
  quantity: number,
  slippageBps = 1000,
): number {
  return Math.ceil((fptPerTicket * quantity * (10_000 + slippageBps)) / 10_000);
}

/** Format raw µFPT (6-decimal) to human-readable string */
export function formatFPT(raw: number | bigint): string {
  return (Number(raw) / 1_000_000).toFixed(4);
}

