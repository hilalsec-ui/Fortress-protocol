// Centralized configuration constants for the Fortress Protocol

// Program Configuration
export const PROGRAM_ID = "2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY";
export const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";

// Crank wallet public key — server-side only; used for house-sponsored draw triggers
export const CRANK_AUTHORITY = 'BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5';

// Lottery Configuration
export const LOTTERY_TYPES = ["LPM", "DPL", "WPL", "MPL"] as const;
export type LotteryType = (typeof LOTTERY_TYPES)[number];

// Price Tiers (USD, fixed anchor — FPT amount floats with market rate)
export const PRICE_TIERS = [5, 10, 15, 20] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

// LPM-specific tiers (Lightning Pool MaxOut)
export const LPM_TIERS = [5, 10, 20, 50] as const;
export type LPMTier = (typeof LPM_TIERS)[number];

// Brand Configuration
export const BRANDS = [
  {
    id: "DPL",
    name: "Daily Lottery",
    description: "24-hour autonomous settlement cycle",
    tiers: PRICE_TIERS,
  },
  {
    id: "WPL",
    name: "Weekly Lottery",
    description: "Weekly lottery with bigger prizes",
    tiers: PRICE_TIERS,
  },
  {
    id: "MPL",
    name: "Monthly Lottery",
    description: "Monthly lottery with premium prizes",
    tiers: PRICE_TIERS,
  },
] as const;

// Token Configuration - FPT Token (6 decimals)
export const FPT_MINT = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj";
export const FPT_TOKEN_ICON = "https://raw.githubusercontent.com/hilalsec-ui/DPLS-Decentralized-Protocol-Lottery-System/refs/heads/main/icon%20fpt.png";

// Token Program IDs
export const TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// FPT Exchange Rate: Fetched dynamically from PricingConfig PDA
// Default fallback: 1 USD = 0.5 FPT (rate = 500,000)
export const FPT_DECIMALS = 6;

// Admin Configuration
// TODO: Move to environment variable for production
export const ADMIN_WALLET = "EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv";

// Draw Bounty — settler reward is computed live at ~$0.50 USD worth of FPT.
// The actual amount is passed as a parameter to fulfillDrawEntropy (min 0.1, max 100 FPT).
export const DRAW_BOUNTY_RAW = 1_000_000; // legacy fallback 1.0 FPT; live rate used instead

// Prize split mirrors on-chain logic: winner gets 95%, protocol treasury 5%
export const PRIZE_WINNER_PCT = 95;
export const PRIZE_TREASURY_PCT = 5;

// Switchboard V3 On-Demand Configuration
export const SB_ON_DEMAND_PROGRAM = "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2";
export const SB_MAINNET_QUEUE = "3u9PpRz7fN8Lp693zPueppQf94v7N2jKj3C18j9o7oG1";
// Switchboard Quote Program — used by fetchManagedUpdateIxs to write verified prices
export const QUOTE_PROGRAM_ID = "orac1eFjzWL5R3RbbdMV68K9H6TaCVVcL6LjvQQWAbz";
// SOL/USD feed hash for fetchManagedUpdateIxs (Coinbase + Binance aggregate).
// Computed from the job definition by FeedHash.computeOracleFeedId().
// A fresh value can be obtained by running: crossbar.simulateJobs({jobs: [...]}).
export const SB_SOL_USD_FEED_HASH = ""; // TODO: set once, e.g. "0xef0d8b6fcd..."
// Legacy placeholder kept for reference — on-chain account is now the instructions sysvar.
export const SB_SOL_USD_FEED_MAINNET = ""; // no longer used as feed pubkey
export const DEFAULT_FPT_PER_SOL = 1000; // 1 SOL = 1000 FPT (Pool_Ratio constant)
// SRS oracle reveal poll timeout (ms) — oracle typically reveals in 1-5 seconds
export const SRS_POLL_TIMEOUT_MS = 90_000; // 90s — mainnet oracle can be slow

// Switchboard V3 VRF — Randomness accounts (pre-initialized by admin via "sb randomness init")
// One RandomnessAccount per (lotteryType, tier). Each must be owned by SB_ON_DEMAND_PROGRAM.
// Leave pubkey empty string to hide VRF button on that tier → falls back to clock draw.
// SB_RANDOMNESS_ACCOUNTS: filled by `npx ts-node scripts/init-sb-randomness.ts`
// Empty string on a tier → VRF button hidden on that tier (falls back to clock draw).
export const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {
  LPM: {
    5:  "3RNBFv6gsfLVAdPShje3U4oWksJ5yei8BxAPEpkpjvcZ",
    10: "89yqdqDCCEVEcDDtiSruUzbogPwvSafQogVw6RrvWyXr",
    20: "ABztidiDtQc5f8AWpCEAH812SsMWPFfx1cj6hq97jsPK",
    50: "BaVkrGGXenHmyJiugxqabVUZT688cRdqbzWTR5B8FRRd",
  },
  DPL: {
    5:  "DXD7WX7ZJ6J3G4en9QjfLMED4NNFaUccnH2p4SBDnELi",
    10: "BVsgsmAcgxuut5m6iHTVq2cjQ9Kou8zwGfwb9oBAUect",
    15: "54jw437jQKWWx4fSNhUm1ksVyXMbtNVPExDmPzNX7VR8",
    20: "AQqoHS5s5VABzpGdjTRcxDUwTWgs8bWtM8gTuMAzXS1T",
  },
  WPL: {
    5:  "EoHXzefgFstYot72iswj9oZ3UHbPdCv44boodxDD4Age",
    10: "H5ekLQD7NwKgcpc5AJ73nEohv5QTxVUVYHFAh2kMGfSR",
    15: "5RnkTBHtqV9j7Z9xEiDDixwsCLNwNKjDa9N4vBr74XYt",
    20: "8YZaUddM74dH3Aqe3wAYUyJnVNDQaZyCfh7UpS8pKW4C",
  },
  MPL: {
    5:  "2H1VT31g6gXLfpoT92D3yvtqCBaztXELiueUXYdPKUMB",
    10: "Hag4Kd215YVSCVsQfA9K85PmF2LBRij3WF65FAJbjNNy",
    15: "2d8TfV4tmGNT5bANfYPPy3CaqhmUczKzp9DEinE6kaTA",
    20: "Hhza1xnE1cn89xTE3Mmn9Zx5y426iUdpdkySAjUMpCrD",
  },
};
// SB_ORACLE_DEVNET removed — oracle is now read directly from the RandomnessAccount data
// at offset 104 (see requestDrawEntropy in lotteryService.ts). No manual config needed.

// Community Draw Configuration
// TOTAL_ANNUAL_DRAWS = DPL (4 tiers × 365) + WPL (4 × 52) + MPL (4 × 12) = 1460 + 208 + 48
export const TOTAL_ANNUAL_DRAWS = 1716;

// UI Configuration
export const MAX_PARTICIPANTS_PER_PAGE = 50;
export const REFRESH_INTERVAL_MS = 10000; // 10 seconds
