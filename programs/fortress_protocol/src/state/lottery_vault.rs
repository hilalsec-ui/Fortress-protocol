use anchor_lang::prelude::*;
use super::LotteryType;

/// Vault state machine for draw lifecycle management
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum VaultState {
    #[default]
    Active,           // 0 - Normal operation - accepting tickets
    ReadyToWithdraw,  // 1 - Draw triggered but failed - prize claimable
    Claimed,          // 2 - Prize claimed, resetting to Active
    Ready,            // 3 - Time expired, draw imminent — ticket purchases locked
}

#[account]
#[derive(Default)]
pub struct LotteryVault {
    pub lottery_type: LotteryType,
    pub tier: u8,
    pub round_number: u32,
    pub balance: u64,
    pub participant_count: u32,
    pub current_page: u32,
    pub end_time: i64,
    pub last_winner: Option<Pubkey>,
    pub last_prize: u64,
    pub is_drawn: bool,
    pub state: VaultState,  // NEW: Lifecycle state
    pub bump: u8,
}

impl LotteryVault {
    pub const LEN: usize = 8 + // discriminator
        1 +  // lottery_type (enum)
        1 +  // tier
        4 +  // round_number
        8 +  // balance
        4 +  // participant_count
        4 +  // current_page
        8 +  // end_time
        33 + // last_winner (Option<Pubkey>)
        8 +  // last_prize
        1 +  // is_drawn
        1 +  // state (VaultState enum)
        1;   // bump
}
