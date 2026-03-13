use anchor_lang::prelude::*;

pub const MAX_WINNER_HISTORY: usize = 50;

/// A single draw result stored permanently on-chain.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct WinnerRecord {
    /// The winner's wallet public key
    pub winner: Pubkey,    // 32
    /// The round number that was drawn (round_number BEFORE increment)
    pub round: u32,        // 4
    /// Prize paid to winner in FPT base units (6 decimals)
    pub prize: u64,        // 8
    /// Unix timestamp of the draw (from Clock::get())
    pub timestamp: i64,    // 8
}

impl WinnerRecord {
    pub const LEN: usize = 32 + 4 + 8 + 8; // 52 bytes
}

/// Per-tier on-chain winner history — stores the last MAX_WINNER_HISTORY draws.
/// Seeds: [b"winner_history", &[lottery_type_index], &[tier]]
/// One account per (lottery_type, tier) → 16 accounts total.
#[account]
#[derive(Default)]
pub struct WinnerHistory {
    /// LotteryType as u8: LPM=0, DPL=1, WPL=2, MPL=3
    pub lottery_type_index: u8,
    /// Tier value (e.g. 5, 10, 20, 50)
    pub tier: u8,
    /// PDA bump
    pub bump: u8,
    /// Ordered list of draw results — oldest first, newest last.
    /// Capped at MAX_WINNER_HISTORY (ring-buffer: oldest evicted when full).
    pub records: Vec<WinnerRecord>,
}

impl WinnerHistory {
    pub const SEED_PREFIX: &'static [u8] = b"winner_history";

    pub const LEN: usize = 8            // discriminator
        + 1                              // lottery_type_index
        + 1                              // tier
        + 1                              // bump
        + 4                              // Vec<> length prefix
        + MAX_WINNER_HISTORY * WinnerRecord::LEN; // 50 * 52 = 2600

    /// Appends a new record, evicting the oldest entry when the list is full.
    pub fn push_record(&mut self, record: WinnerRecord) {
        if self.records.len() >= MAX_WINNER_HISTORY {
            self.records.remove(0); // O(n) but n ≤ 50 — acceptable
        }
        self.records.push(record);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — run with: cargo test --lib
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    /// Build a dummy WinnerRecord whose `round` field acts as a unique ID.
    fn record(round: u32) -> WinnerRecord {
        WinnerRecord {
            winner: Pubkey::default(),
            round,
            prize: round as u64 * 1_000_000,
            timestamp: round as i64,
        }
    }

    fn empty_history() -> WinnerHistory {
        WinnerHistory {
            lottery_type_index: 0,
            tier: 5,
            bump: 255,
            records: Vec::new(),
        }
    }

    // ── 1. Fills to exactly 50 ───────────────────────────────────────────────
    #[test]
    fn fills_to_50_without_eviction() {
        let mut h = empty_history();
        for i in 1..=50 {
            h.push_record(record(i));
        }
        assert_eq!(h.records.len(), 50, "should hold exactly 50 records");
        assert_eq!(h.records[0].round,  1,  "oldest is draw 1");
        assert_eq!(h.records[49].round, 50, "newest is draw 50");
    }

    // ── 2. Evicts draw 1 when draw 51 arrives ───────────────────────────────
    #[test]
    fn evicts_oldest_at_51() {
        let mut h = empty_history();
        for i in 1..=50 { h.push_record(record(i)); }

        h.push_record(record(51));

        assert_eq!(h.records.len(), 50, "still 50 records after 51st push");
        assert_eq!(h.records[0].round,  2,  "draw 1 is gone — oldest is now draw 2");
        assert_eq!(h.records[49].round, 51, "draw 51 is at the end");
    }

    // ── 3. Length never exceeds 50 no matter how many draws ─────────────────
    #[test]
    fn length_never_exceeds_50() {
        let mut h = empty_history();
        for i in 1..=200 {
            h.push_record(record(i));
            assert!(
                h.records.len() <= MAX_WINNER_HISTORY,
                "len {} exceeded MAX at draw {}",
                h.records.len(), i
            );
        }
        assert_eq!(h.records.len(), 50);
    }

    // ── 4. After 200 draws, holds draws 151–200 (the last 50) ───────────────
    #[test]
    fn holds_last_50_after_200_draws() {
        let mut h = empty_history();
        for i in 1..=200 { h.push_record(record(i)); }

        assert_eq!(h.records[0].round,  151, "oldest stored is draw 151");
        assert_eq!(h.records[49].round, 200, "newest stored is draw 200");

        // every record's round must be in 151..=200
        for rec in &h.records {
            assert!(rec.round >= 151 && rec.round <= 200);
        }
    }

    // ── 5. Records are always in insertion order (oldest→newest) ─────────────
    #[test]
    fn records_are_ordered_oldest_to_newest() {
        let mut h = empty_history();
        for i in 1..=75 { h.push_record(record(i)); }

        let rounds: Vec<u32> = h.records.iter().map(|r| r.round).collect();
        for w in rounds.windows(2) {
            assert!(w[0] < w[1], "out-of-order: {} then {}", w[0], w[1]);
        }
    }
}
