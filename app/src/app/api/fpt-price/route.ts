/**
 * GET /api/fpt-price
 *
 * Server-side aggregator for FPT and SOL prices.
 * Runs on the server to avoid browser CORS restrictions.
 *
 * Returns:
 *   { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd }
 */

import { NextResponse } from 'next/server';

const FPT_MINT = '3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj';

const DEFAULT_FPT_PER_SOL = 1_000;
const DEFAULT_SOL_USD_6DEC = 180_000_000; // $180.00 fallback
const MIN_FPT_PER_USD = Math.round((DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / 1_000_000_000); // floor

// short cache: 60s when no DEX price, 5min when price known
export const revalidate = 60;

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSolUsd(): Promise<number | null> {
  // 1. CoinGecko
  try {
    const res = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    );
    if (res.ok) {
      const data = await res.json();
      const p = data?.solana?.usd;
      if (typeof p === 'number' && p > 0) return p;
    }
  } catch { /* fall through */ }

  // 2. Coinbase
  try {
    const res = await fetchWithTimeout('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
    if (res.ok) {
      const data = await res.json();
      const p = parseFloat(data?.data?.rates?.USD);
      if (isFinite(p) && p > 0) return p;
    }
  } catch { /* fall through */ }

  return null;
}

async function fetchFptMarketPrice(): Promise<number | null> {
  // 1. DexScreener — most reliable for new Raydium pools
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${FPT_MINT}`;
    const res = await fetchWithTimeout(url, 10000);
    if (res.ok) {
      const data = await res.json();
      const pairs = data?.pairs ?? [];
      const pair = pairs
        .filter((p: { chainId?: string; priceUsd?: string }) =>
          p.chainId === 'solana' && p.priceUsd,
        )
        .sort((a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
          (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
        )[0];
      const price = parseFloat(pair?.priceUsd);
      if (isFinite(price) && price > 0) {
        console.log(`[fpt-price] DexScreener price: $${price}`);
        return price;
      }
      console.warn(`[fpt-price] DexScreener returned ${pairs.length} pairs but no valid price`);
    } else {
      console.warn(`[fpt-price] DexScreener status ${res.status}`);
    }
  } catch (e) {
    console.warn('[fpt-price] DexScreener fetch failed:', (e as Error).message);
  }

  // 2. GeckoTerminal (CoinGecko's DEX aggregator, no auth required)
  try {
    const res = await fetchWithTimeout(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${FPT_MINT}`,
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.attributes?.price_usd);
      if (isFinite(price) && price > 0) {
        console.log(`[fpt-price] GeckoTerminal price: $${price}`);
        return price;
      }
    }
  } catch { /* fall through */ }

  // 3. Raydium API v3
  try {
    const res = await fetchWithTimeout(
      `https://api-v3.raydium.io/mint/price?mints=${FPT_MINT}`,
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.[FPT_MINT]);
      if (isFinite(price) && price > 0) {
        console.log(`[fpt-price] Raydium price: $${price}`);
        return price;
      }
    }
  } catch { /* fall through */ }

  console.warn('[fpt-price] All DEX price sources returned null');
  return null;
}

export async function GET(): Promise<NextResponse> {
  const [liveSolPrice, fptMarketUsd] = await Promise.all([
    fetchSolUsd(),
    fetchFptMarketPrice(),
  ]);

  const solUsd6dec = liveSolPrice != null
    ? Math.round(liveSolPrice * 1_000_000)
    : DEFAULT_SOL_USD_6DEC;
  const solUsd = solUsd6dec / 1_000_000;

  // When a live DEX market price is available, use it directly so that
  // "buy $5 ticket" = exactly $5 worth of FPT at the current Raydium price.
  // Fall back to the SOL oracle formula when no liquidity exists.
  const fptPerUsd6dec = fptMarketUsd != null
    ? Math.round(1_000_000 / fptMarketUsd)   // µFPT per $1 at market price
    : Math.max(
        Math.round((DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / solUsd6dec),
        MIN_FPT_PER_USD,
      );
  const fptUsd = fptMarketUsd ?? (solUsd6dec / (DEFAULT_FPT_PER_SOL * 1_000_000));

  console.log(`[fpt-price] Response: solUsd=${solUsd} fptMarketUsd=${fptMarketUsd} fptPerUsd6dec=${fptPerUsd6dec} fptUsd=${fptUsd}`);

  // Use shorter cache when no DEX price found yet
  const maxAge = fptMarketUsd != null ? 300 : 60;

  return NextResponse.json(
    { solUsd, fptUsd, fptPerUsd6dec, fptMarketUsd },
    { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=30` } },
  );
}
