/**
 * switchboardPriceService.ts
 *
 * FPT ticket pricing via Switchboard On-Demand CrossbarClient.
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
import { CrossbarClient } from "@switchboard-xyz/common";

// ── Constants mirroring oracle.rs ─────────────────────────────────────────
/** oracle.rs DEFAULT_FPT_PER_SOL */
const DEFAULT_FPT_PER_SOL = 1_000;
/** oracle.rs DEFAULT_SOL_USD_6DEC — fallback when Crossbar is unreachable */
const DEFAULT_SOL_USD_6DEC = 180_000_000; // $180.00
const DEFAULT_SOL_PRICE_USD = DEFAULT_SOL_USD_6DEC / 1_000_000; // 180

/** Default fptPerUsd6dec (µFPT per $1) at the $180 SOL fallback */
export const DEFAULT_FPT_PER_USD = Math.round(
  (DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / DEFAULT_SOL_USD_6DEC,
); // ≈ 5_555_556

/** Minimum fptPerUsd6dec — clamps display when SOL approaches $1 000 */
export const MIN_FPT_PER_USD = Math.round(
  (DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / 1_000_000_000,
); // = 1_000_000

// ── Cache ─────────────────────────────────────────────────────────────────
let _cache: {
  fptUsd: number;
  fptPerUsd6dec: number;
  fetchedAt: number;
} | null = null;
const CACHE_TTL_MS = 30_000;

// ── SOL/USD fetch via Switchboard CrossbarClient ──────────────────────────
async function fetchSolUsdViaCrossbar(): Promise<number | null> {
  try {
    const crossbar = CrossbarClient.default();

    // simulateJobs POSTs the job definition directly — no store step needed.
    // This mirrors what a Switchboard oracle node does when evaluating the feed.
    const response = await crossbar.simulateJobs({
      jobs: [
        {
          tasks: [
            {
              httpTask: {
                url: "https://api.coinbase.com/v2/exchange-rates?currency=SOL",
              },
            },
            { jsonParseTask: { path: "$.data.rates.USD" } },
          ],
        },
      ],
    } as any);

    const raw = response?.results?.[0];
    const price = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (isFinite(price) && price > 0) return price;
    return null;
  } catch (err) {
    console.warn("[SBPrice] CrossbarClient error:", err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch live SOL/USD via Switchboard Crossbar and compute fptPerUsd6dec using
 * the exact formula from oracle.rs `compute_fpt_ticket_cost`.
 * Falls back to DEFAULT_SOL_USD_6DEC ($180) on any error.
 */
export async function fetchFptUsdPrice(): Promise<{
  fptUsd: number;
  fptPerUsd6dec: number;
}> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return { fptUsd: _cache.fptUsd, fptPerUsd6dec: _cache.fptPerUsd6dec };
  }

  let solUsd6dec = DEFAULT_SOL_USD_6DEC;
  const liveSolPrice = await fetchSolUsdViaCrossbar();

  if (liveSolPrice !== null) {
    solUsd6dec = Math.round(liveSolPrice * 1_000_000);
    console.log(
      `[SBPrice] SOL/USD = $${liveSolPrice.toFixed(2)}, sol_usd_6dec = ${solUsd6dec}`,
    );
  } else {
    console.warn(
      `[SBPrice] Fallback: sol_usd_6dec = ${DEFAULT_SOL_USD_6DEC} ($${DEFAULT_SOL_PRICE_USD})`,
    );
  }

  // Exact mirror of oracle.rs compute_fpt_ticket_cost:
  //   µFPT per $1 = DEFAULT_FPT_PER_SOL × 10^12 / sol_usd_6dec
  const fptPerUsd6dec = Math.max(
    Math.round((DEFAULT_FPT_PER_SOL * 1_000_000_000_000) / solUsd6dec),
    MIN_FPT_PER_USD,
  );
  // USD value of 1 FPT = sol_usd_6dec / (DEFAULT_FPT_PER_SOL × 10^6)
  const fptUsd = solUsd6dec / (DEFAULT_FPT_PER_SOL * 1_000_000);

  _cache = { fptUsd, fptPerUsd6dec, fetchedAt: now };
  return { fptUsd, fptPerUsd6dec };
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
