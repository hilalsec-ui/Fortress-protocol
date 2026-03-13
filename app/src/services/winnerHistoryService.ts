"use client";

import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { RecentWinner } from "./winnerService";
import { PROGRAM_ID } from "../utils/constants";

// Lottery type index map must match the on-chain program enum.
const LOTTERY_TYPE_INDEX: Record<string, number> = {
  LPM: 0,
  DPL: 1,
  WPL: 2,
  MPL: 3,
};

// Valid tiers for each lottery type — must match on-chain is_valid_tier logic.
const LOTTERY_TIERS: Record<string, number[]> = {
  LPM: [5, 10, 20, 50],
  DPL: [5, 10, 15, 20],
  WPL: [5, 10, 15, 20],
  MPL: [5, 10, 15, 20],
};

const WINNER_HISTORY_SEED = "winner_history";
const PROGRAM_PUBLIC_KEY = new PublicKey(PROGRAM_ID);

/** Derive the WinnerHistory PDA for a given lottery type + tier. */
export function getWinnerHistoryPDA(
  lotteryType: string,
  tier: number,
  programId: PublicKey = PROGRAM_PUBLIC_KEY
): PublicKey {
  const typeIndex = LOTTERY_TYPE_INDEX[lotteryType] ?? 0;
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(WINNER_HISTORY_SEED),
      Buffer.from([typeIndex]),
      Buffer.from([tier]),
    ],
    programId
  );
  return pda;
}

/** All 16 (lotteryType, tier) combinations. */
export function getAllWinnerHistoryConfigs(): Array<{ lotteryType: string; tier: number; pda: PublicKey }> {
  const configs: Array<{ lotteryType: string; tier: number; pda: PublicKey }> = [];
  for (const [lotteryType, tiers] of Object.entries(LOTTERY_TIERS)) {
    for (const tier of tiers) {
      configs.push({ lotteryType, tier, pda: getWinnerHistoryPDA(lotteryType, tier) });
    }
  }
  return configs;
}

/**
 * Fetch all on-chain WinnerHistory accounts and flatten them into RecentWinner entries,
 * sorted newest-first. Returns an empty array if the program or accounts are unavailable.
 */
export async function fetchAllWinnerHistories(program: Program<any>): Promise<RecentWinner[]> {
  const configs = getAllWinnerHistoryConfigs();
  const pdas = configs.map(c => c.pda);

  let rawAccounts: (any | null)[];
  try {
    // fetchMultiple returns null for accounts that don't exist yet (no draws yet for that tier)
    rawAccounts = await (program.account as any).winnerHistory.fetchMultiple(pdas);
  } catch (err) {
    console.warn("[winnerHistoryService] fetchMultiple failed:", err);
    return [];
  }

  const results: RecentWinner[] = [];

  for (let i = 0; i < configs.length; i++) {
    const account = rawAccounts[i];
    if (!account) continue; // tier has had no draws yet

    const { lotteryType, tier } = configs[i];

    for (const record of account.records ?? []) {
      const winner = record.winner?.toString?.() ?? "";
      if (!winner || winner === "11111111111111111111111111111111") continue;

      const round: number =
        typeof record.round?.toNumber === "function"
          ? record.round.toNumber()
          : Number(record.round ?? 0);

      const prize: number =
        typeof record.prize?.toNumber === "function"
          ? record.prize.toNumber()
          : Number(record.prize ?? 0);

      const timestamp: number =
        typeof record.timestamp?.toNumber === "function"
          ? record.timestamp.toNumber()
          : Number(record.timestamp ?? 0);

      results.push({
        winner,
        lotteryType,
        tier,
        roundNumber: round,
        blockTime: timestamp > 0 ? timestamp : null,
      });
    }
  }

  // Sort newest first: round desc, then timestamp desc
  results.sort((a, b) => {
    if ((b.roundNumber ?? 0) !== (a.roundNumber ?? 0)) return (b.roundNumber ?? 0) - (a.roundNumber ?? 0);
    return ((b.blockTime ?? 0) - (a.blockTime ?? 0));
  });

  console.log(`[winnerHistoryService] Fetched ${results.length} on-chain winner records across 16 history PDAs`);
  return results;
}
