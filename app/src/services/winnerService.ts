"use client";

export interface RecentWinner {
  winner: string;
  lotteryType: string;
  tier: number;
  roundNumber: number;
  blockTime: number | null;
}

/**
 * Extract recent winners from lottery vault accounts (no RPC parsing needed)
 * This is much more reliable than parsing transaction logs
 */
function isValidAddress(addr: any): boolean {
  if (!addr) return false;
  const str = String(addr).trim();
  if (str.length < 32 || str.length > 44) return false;
  if (str === "11111111111111111111111111111111") return false;
  return /^[1-9A-HJ-NP-Z]{32,44}$/.test(str);
}

export function extractRecentWinnersFromVaults(lotteryAccounts: any[] | null): RecentWinner[] {
  if (!lotteryAccounts || !Array.isArray(lotteryAccounts)) {
    console.warn('[extractWinners] No lottery accounts provided');
    return [];
  }

  const winners: RecentWinner[] = [];
  const zeroAddress = "11111111111111111111111111111111";
  let invalidCount = 0;

  for (const vaultData of lotteryAccounts) {
    if (!vaultData || !vaultData.lotteryType) continue;

    const {
      lotteryType,
      tiers,
    } = vaultData;

    if (!tiers || !Array.isArray(tiers)) continue;

    for (const tierData of tiers) {
      if (!tierData) continue;

      let lastWinner = tierData.lastWinner?.toString?.() || tierData.lastWinner;
      if (lastWinner && typeof lastWinner !== 'string') {
        lastWinner = String(lastWinner).trim();
      }
      
      const tier = tierData.tier ?? tierData.tier_index ?? 0;
      // round_number is incremented AFTER each draw (starts at 1 on init, becomes 2 after draw 1).
      // Subtract 1 so the winner shows the round they were drawn in: #1, #2, #3 … unlimited.
      const rawRound = tierData.roundNumber?.toNumber?.() || tierData.roundNumber || 0;
      const roundNumber = rawRound > 0 ? rawRound - 1 : 0;

      if (typeof tier !== 'number' || tier < 0) {
        console.warn(`[extractWinners] Invalid tier: ${tier} for ${lotteryType}`);
        continue;
      }

      if (!isValidAddress(lastWinner)) {
        invalidCount++;
        continue;
      }

      const normalizedWinner = String(lastWinner).trim();
      winners.push({
        winner: normalizedWinner,
        lotteryType,
        tier,
        roundNumber,
        blockTime: null,
      });
    }
  }

  console.log(`[extractWinners] Extracted ${winners.length} valid winners (${invalidCount} invalid)`);
  return winners;
}
