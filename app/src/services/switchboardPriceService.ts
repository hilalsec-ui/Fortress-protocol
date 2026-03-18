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
/** 5 min when a DEX price is known; 60 s when null so we pick up new Raydium pools quickly */
const CACHE_TTL_PRICE_MS = 300_000;
const CACHE_TTL_NO_MARKET_MS = 60_000;

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
 * Fetch FPT's live market price from multiple DEX sources in sequence:
 * 1. Jupiter Price API v2 (best coverage across all Solana DEXes)
 * 2. Raydium API v3 (direct — catches Raydium pools before Jupiter indexes them)
 * 3. DexScreener (broad aggregator — picks up new pools within minutes)
 * Returns null when no source has a price for the token yet.
 */
async function fetchFptMarketPrice(): Promise<number | null> {
  // NOTE: Jupiter is intentionally skipped here — it can return SOL-denominated
  // prices which are ~10 000× too high in USD terms and poison the 5-min cache.

  // 1. Raydium API v3 — often indexes new pools before Jupiter does
  try {
    const res = await fetchWithTimeout(
      `https://api-v3.raydium.io/mint/price?mints=${FPT_MINT}`,
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.[FPT_MINT]);
      if (isFinite(price) && price > 0) return price;
    }
  } catch { /* fall through */ }

  // 3. DexScreener — broad aggregator, picks up new pools within minutes
  try {
    const res = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${FPT_MINT}`,
      8000,
    );
    if (res.ok) {
      const data = await res.json();
      // Pick the most liquid Solana pair with a USD price
      const pair = (data?.pairs ?? [])
        .filter((p: { chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }) =>
          p.chainId === 'solana' && p.priceUsd,
        )
        .sort((a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
          (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
        )[0];
      const price = parseFloat(pair?.priceUsd);
      if (isFinite(price) && price > 0) return price;
    }
  } catch { /* no DEX market yet */ }

  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────────────

/**
 * Prime the in-memory cache with a price already fetched externally (e.g. from
 * FptPriceContext). Call this just before executing a buy so that
 * fetchFptUsdPrice() won't fall back to a stale or Jupiter-derived value.
 */
export function setCachedPrice(p: {
  solUsd: number;
  fptUsd: number;
  fptPerUsd6dec: number;
  fptMarketUsd: number | null;
}): void {
  _cache = { ...p, fetchedAt: Date.now() };
}

/**
 * Fetch live prices via our own /api/fpt-price server-side route.
 * This avoids browser CORS restrictions and keeps external API keys off the client.
 * Falls back to direct fetching if the API route is unreachable (e.g. local dev without server).
 */
export async function fetchFptUsdPrice(): Promise<{
  solUsd: number;
  fptUsd: number;
  fptPerUsd6dec: number;
  fptMarketUsd: number | null;
}> {
  const now = Date.now();
  const cacheTtl = _cache?.fptMarketUsd != null ? CACHE_TTL_PRICE_MS : CACHE_TTL_NO_MARKET_MS;
  if (_cache && now - _cache.fetchedAt < cacheTtl) {
    return {
      solUsd: _cache.solUsd,
      fptUsd: _cache.fptUsd,
      fptPerUsd6dec: _cache.fptPerUsd6dec,
      fptMarketUsd: _cache.fptMarketUsd,
    };
  }

  // Primary: call our own server-side route (no CORS issues, reliable)
  try {
    const res = await fetchWithTimeout('/api/fpt-price', 10_000);
    if (res.ok) {
      const data = await res.json();
      const { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd } = data;
      if (typeof solUsd === 'number' && typeof fptPerUsd6dec === 'number') {
        _cache = { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd: fptMarketUsd ?? null, fetchedAt: now };
        return { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd: fptMarketUsd ?? null };
      }
    }
  } catch { /* fall through to direct fetch */ }

  // Fallback: fetch directly (used in local dev / API route unavailable)
  let solUsd6dec = DEFAULT_SOL_USD_6DEC;
  const [liveSolPrice, fptMarketUsd] = await Promise.all([
    fetchSolUsd(),
    fetchFptMarketPrice(),
  ]);

  if (liveSolPrice !== null) {
    solUsd6dec = Math.round(liveSolPrice * 1_000_000);
  } else {
    console.warn(`[SBPrice] All price sources failed — using fallback $${DEFAULT_SOL_PRICE_USD} SOL`);
  }

  // When DEX market price is available, use it (market-price parity).
  const fptPerUsd6dec = fptMarketUsd != null
    ? Math.round(1_000_000 / fptMarketUsd)
    : Math.max(
        Math.round((DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / solUsd6dec),
        MIN_FPT_PER_USD,
      );
  const fptUsd = fptMarketUsd ?? (solUsd6dec / (DEFAULT_FPT_PER_SOL * 1_000_000));
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

