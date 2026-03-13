use anchor_lang::prelude::*;

/// Stores draw state between the two-step request/fulfill cycle.
///
/// Seeds: `[b"pending_draw", &[lottery_type_id], &[tier]]`
/// Only one pending draw per (lottery_type, tier) at a time.
#[account]
pub struct PendingDraw {
    /// 0=LPM, 1=DPL, 2=WPL, 3=MPL
    pub lottery_type_id: u8,
    /// $-value tier (5, 10, 20, 50)
    pub tier: u8,
        /// Switchboard V3 RandomnessAccount created for this draw request.
    /// Filled in by request_draw_entropy after the randomness_commit CPI.
    pub randomness_account: Pubkey,
    /// User-supplied randomness commitment (mixed with SB VRF value at fulfill)
    pub user_commitment: [u8; 32],
    /// Wallet that called request_draw (receives rent refund at fulfill)
    pub requester: Pubkey,
    /// Unix timestamp of request (informational only — draws never expire)
    pub requested_at: i64,
    /// PDA bump
    pub bump: u8,
    /// The oracle's reveal_slot at request time — used to ensure the oracle
    /// reveals AFTER this draw was requested, preventing reuse of old SB values.
    /// At request, we record the current reveal_slot (0 or any previous value).
    /// At fulfill, we require reveal_slot > request_reveal_slot.
    pub request_reveal_slot: u64,
}

impl PendingDraw {
    pub const SEED_PREFIX: &'static [u8] = b"pending_draw";
    /// Discriminator (8) + lottery_type_id (1) + tier (1) + randomness_account (32)
    /// + user_commitment (32) + requester (32) + requested_at (8) + bump (1)
    /// + request_reveal_slot (8) = 123
    pub const LEN: usize = 8 + 1 + 1 + 32 + 32 + 32 + 8 + 1 + 8;
}
